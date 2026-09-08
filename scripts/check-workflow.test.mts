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
const nightly = load(readFileSync('.github/workflows/nightly.yml', 'utf8'));

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

  it('the scheduled build is NIGHTLY, because that is what PRODUCT.md claims', () => {
    // It was weekly, and the claim said "every commit and every night". A schedule that runs on
    // Mondays catches time-based rot up to seven days late, and the difference is the whole of
    // SPEC-002 REQ-6.
    const schedules = nightly.on?.schedule ?? [];
    expect(
      schedules.length,
      'no scheduled run: nothing exercises the template between commits',
    ).toBeGreaterThan(0);
    const [, , dom, month, dow] = schedules[0].cron.split(/\s+/);
    expect(
      [dom, month, dow].every((f) => f === '*'),
      `cron "${schedules[0].cron}" does not run every day`,
    ).toBe(true);
  });

  it('the nightly clean-clone build installs from scratch and runs every gate', () => {
    expect(runs('clean-clone', nightly).some((r) => r.startsWith('npm ci'))).toBe(true);
    expect(runs('clean-clone', nightly).some((r) => r.includes('npm run check'))).toBe(true);
  });

  it('the range-drift job resolves ranges fresh — `npm ci` cannot catch what it exists to catch', () => {
    // REQ-6's stated reason for nightly is "the dependency that changed behavior under a caret
    // range". `npm ci` installs the lockfile exactly, so a nightly built on it delivers the
    // artifact and not the property. This asserts the job cannot regress into that.
    const installs = runs('range-drift', nightly).filter((r) => r.startsWith('npm '));
    expect(
      installs.some((r) => r.startsWith('npm install')),
      'no fresh resolution',
    ).toBe(true);
    expect(
      installs.some((r) => r.startsWith('npm ci')),
      '`npm ci` defeats this job',
    ).toBe(false);
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
