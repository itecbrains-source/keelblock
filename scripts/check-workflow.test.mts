import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

/**
 * The CI workflow makes promises — pinned runtime, no install scripts, secrets scanned over full
 * history, a weekly clean build, evidence preserved. This asserts them against the **parsed**
 * workflow, never its text.
 *
 * SPEC-003 rule 5: a `toContain` over raw YAML is satisfied by a mention in a comment, so a
 * text-matching gate can pass on a workflow that does the opposite of what it claims.
 *
 * This exists because the workflow has never executed — there is no remote yet. Under keelblock's own R3
 * rule an unrun workflow is not a working gate, so until it runs, this is the strongest available
 * evidence, and it is deliberately structural rather than textual.
 */
type Step = { run?: string; uses?: string; if?: string; with?: Record<string, unknown> };
type Workflow = {
  on?: { schedule?: Array<{ cron: string }> };
  jobs: Record<string, { steps?: Step[] }>;
};

const load = (text: string) => parse(text) as Workflow;
const raw = readFileSync('.github/workflows/check.yml', 'utf8');
const wf = load(raw);

const steps = (job: string, w: Workflow = wf): Step[] => w.jobs[job]?.steps ?? [];
const runs = (job: string, w: Workflow = wf) => steps(job, w).map((s) => String(s.run ?? ''));
const uses = (job: string, w: Workflow = wf) => steps(job, w).map((s) => String(s.uses ?? ''));
const stepUsing = (job: string, prefix: string, w: Workflow = wf) =>
  steps(job, w).find((s) => String(s.uses ?? '').startsWith(prefix));

describe('CI workflow', () => {
  it('runs the full check command, not a hand-picked subset', () => {
    // A workflow that runs `tsc` and `vitest` directly drifts from `npm run check` the moment a gate
    // is added, and CI then proves less than a local run does.
    expect(runs('check').some((r) => r.includes('npm run check'))).toBe(true);
  });

  it('installs without running package scripts', () => {
    const install = runs('check').find((r) => r.startsWith('npm ci'));
    expect(install, 'no `npm ci` step found').toBeDefined();
    expect(install).toContain('--ignore-scripts');
  });

  it('scans secrets over FULL history, not just the tip', () => {
    // A secret committed and later removed is still a live compromise (ADR-007).
    const checkout = stepUsing('secrets', 'actions/checkout');
    expect(checkout, 'the secrets job does not check out').toBeDefined();
    expect(checkout?.with?.['fetch-depth']).toBe(0);
    expect(uses('secrets').some((u) => u.includes('gitleaks'))).toBe(true);
  });

  it('has the weekly clean-clone build — the substitute for having users', () => {
    const schedules = wf.on?.schedule ?? [];
    expect(
      schedules.length,
      'no scheduled run: nothing exercises the template between commits',
    ).toBeGreaterThan(0);
    expect(schedules[0].cron).toMatch(/^\S+ \S+ \S+ \S+ \S+$/);
  });

  it('preserves the access matrix even when the run fails', () => {
    // Evidence is worth least exactly when a run goes red, which is when a default `if: success()`
    // would throw it away.
    const upload = stepUsing('check', 'actions/upload-artifact');
    expect(upload, 'the access matrix is never uploaded').toBeDefined();
    expect(upload?.if).toBe('always()');
    expect(String(upload?.with?.path)).toContain('ACCESS-MATRIX');
  });

  it('pins the Node major to the one the freshness stamp claims was verified', () => {
    const node = stepUsing('check', 'actions/setup-node');
    expect(String(node?.with?.['node-version'])).toBe('26');
  });

  it('installs the policy prober — otherwise the isolation gate cannot run at all', () => {
    expect(runs('check').some((r) => r.includes('requirements.txt'))).toBe(true);
    expect(uses('check').some((u) => u.includes('supabase/setup-cli'))).toBe(true);
  });

  // ── mutation proofs: mutate the PARSED workflow and assert each check would fail ──────────────

  it('MUTATION: plain `npm ci` (install scripts enabled) is caught', () => {
    const m = load(raw);
    m.jobs.check.steps = steps('check', m).map((s) =>
      s.run?.startsWith('npm ci') ? { ...s, run: 'npm ci' } : s,
    );
    expect(runs('check', m).find((r) => r.startsWith('npm ci'))).not.toContain('--ignore-scripts');
  });

  it('MUTATION: a shallow checkout in the secrets job is caught', () => {
    const m = load(raw);
    steps('secrets', m)[0].with = { 'fetch-depth': 1 };
    expect(stepUsing('secrets', 'actions/checkout', m)?.with?.['fetch-depth']).not.toBe(0);
  });

  it('MUTATION: dropping the schedule is caught', () => {
    const m = load(raw);
    delete m.on?.schedule;
    expect(m.on?.schedule ?? []).toHaveLength(0);
  });

  it('MUTATION: an artifact upload that skips failed runs is caught', () => {
    const m = load(raw);
    const upload = stepUsing('check', 'actions/upload-artifact', m)!;
    upload.if = 'success()';
    expect(stepUsing('check', 'actions/upload-artifact', m)?.if).not.toBe('always()');
  });

  it('MUTATION: text matching would pass on a workflow that does the opposite', () => {
    // The trap this whole file exists to avoid: a commented-out promise satisfies `toContain`.
    const lying = `
      name: check
      on: { push: { branches: [main] } }
      jobs:
        check:
          runs-on: ubuntu-latest
          steps:
            # npm ci --ignore-scripts   <- a comment, not a step
            - run: npm ci
    `;
    expect(lying).toContain('--ignore-scripts'); // text: fooled
    const parsed = load(lying);
    expect(runs('check', parsed).find((r) => r.startsWith('npm ci'))).not.toContain(
      '--ignore-scripts',
    ); // structure: not fooled
  });
});
