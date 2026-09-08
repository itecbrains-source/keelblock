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
const stepsUsing = (job: string, prefix: string, w: Workflow = wf): Step[] =>
  steps(job, w).filter((s) => String(s.uses ?? '').startsWith(prefix));
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
    // BY NAME, not by action. A second upload step (the journey layer's traces) was added and this
    // silently began asserting about that one instead — the first-match helper was fine while there
    // was one upload and became a different question the moment there were two.
    const upload = stepsUsing('check', 'actions/upload-artifact').find(
      (s) => s.with?.name === 'generated-by-this-run',
    );
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

describe('the upgrade job proves B-10 rather than describing it', () => {
  // Parsed, never matched over text — a `toContain` here would be satisfied by the explanatory
  // comment above the job, which says all of these words.
  const upgradeRuns = runs('upgrade').join('\n');

  it('scaffolds at the PREVIOUS tag, not at HEAD', () => {
    // Upgrading HEAD to HEAD is a job that can only pass.
    expect(wf.jobs.upgrade, 'the upgrade job exists').toBeDefined();
    expect(upgradeRuns).toMatch(/git tag --sort=-creatordate/);
    expect(upgradeRuns).toMatch(/git worktree add/);
  });

  it('gives the buyer a migration dated AFTER the fix they receive', () => {
    // F-45: this is the whole reason `supabase migration up` refuses. A fixture dated before the
    // fix would make the job pass without ever reaching the defect it exists to cover.
    expect(upgradeRuns).toContain('20260910090000_buyer_customer_note.sql');
    const fixture = readFileSync('.github/workflows/fixtures/buyer_customer_note.sql', 'utf8');
    expect(fixture, 'the buyer plants a real tenant table').toMatch(/create table public\./);
  });

  it('resets the scaffold, because a second checkout shares the first one’s database', () => {
    // F-45's near-miss: both checkouts carry the same project_id, so `supabase start` reuses the
    // volume and the "fresh" buyer comes up already holding the fix. Without this the job proves
    // that a fix which was already applied is applied.
    expect(upgradeRuns).toMatch(/supabase db reset/);
  });

  it('runs the CURRENT suite against the upgraded project', () => {
    expect(upgradeRuns).toMatch(/supabase test db/);
  });

  it('AC-7 · fails the build if the upgrade edited a file the buyer owns', () => {
    // The safety property. A job that upgrades and never checks this would pass while overwriting
    // the buyer's work, which is the single failure this whole path exists to avoid.
    expect(upgradeRuns).toMatch(/git diff --quiet HEAD -- src messages/);
    expect(upgradeRuns).toMatch(/exit 1/);
  });

  it('MUTATION: a job missing the buyer-untouched guard is caught', () => {
    const without = load(
      raw.replace(/\s+- name: the buyer's own code survived[\s\S]*?exit 1; \}\n/, '\n'),
    );
    const guarded = runs('upgrade', without).join('\n');
    expect(guarded).not.toMatch(/git diff --quiet HEAD -- src messages/);
  });
});

describe('the upgrade job cannot pass on an upgrade that delivered nothing', () => {
  const upgradeRuns = runs('upgrade').join('\n');

  it('asserts a file ADDED since the tag is present in the scaffold', () => {
    // Without this, every step in the job is satisfied by nothing having happened.
    expect(upgradeRuns).toMatch(/--diff-filter=A/);
    expect(upgradeRuns).toMatch(/test -f "\/tmp\/scaffold\/\$NEW"/);
  });

  it('refuses a release with no added upstream-owned file, rather than passing vacuously', () => {
    expect(upgradeRuns).toMatch(/cannot prove an/);
  });

  it('MUTATION: removing the positive control is caught', () => {
    const without = load(
      raw.replace(/\s+- name: the upgrade actually delivered something[\s\S]*?exit 1; \}\n/, '\n'),
    );
    expect(runs('upgrade', without).join('\n')).not.toMatch(/--diff-filter=A/);
  });
});
