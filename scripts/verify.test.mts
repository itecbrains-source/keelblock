import { describe, expect, it } from 'vitest';
import { planStep, summarize, ACTION_HANDLERS } from './verify.mjs';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

describe('local CI verifier', () => {
  it('executes a plain run step exactly as CI would — a NON-login shell', () => {
    // `-c`, not `-lc`, and the test name is the argument. GitHub Actions runs `run:` steps in a
    // non-login shell, so a login shell here is not "exactly as CI would" — it is a different
    // environment wearing that claim.
    //
    // It was not academic. A login shell sources the user's profile, which selected a different
    // Node: measured during the handover trial, `bash -lc 'node -v'` gave v25.2.1 where `node -v`
    // gave v26.4.0. `freshness` then failed inside `verify` and passed standalone, so the step whose
    // whole purpose is to refuse a Node major that does not match CI's pin was asserting against an
    // interpreter nothing else in the repository uses.
    const p = planStep({ run: 'npm run check' });
    expect(p.state).toBe('ran');
    expect(p.cmd).toEqual(['bash', '-c', 'npm run check']);
  });

  it('defers heavy steps but names them, rather than dropping them', () => {
    const p = planStep({ run: 'npm ci --ignore-scripts' });
    expect(p.state).toBe('skipped');
    expect(p.detail).toMatch(/--full/);
  });

  it('runs heavy steps under --full', () => {
    expect(planStep({ run: 'npm ci --ignore-scripts' }, { full: true }).state).toBe('ran');
  });

  it('runs gitleaks for real when it is installed', () => {
    const p = planStep({ uses: 'gitleaks/gitleaks-action@v2' });
    expect(['local', 'skipped']).toContain(p.state);
    if (p.state === 'local') expect(p.cmd?.[0]).toBe('gitleaks');
  });

  // ── mutation proofs ────────────────────────────────────────────────────────
  // The failure this tool exists to prevent is a confident green that skipped a third of CI.

  it('MUTATION: an unknown action is reported as NOT verified, never silently passed', () => {
    const p = planStep({ uses: 'some/brand-new-action@v1' });
    expect(p.state).toBe('skipped');
    expect(p.detail).toMatch(/NOT verified/);
    expect(p.state).not.toBe('asserted');
  });

  it('MUTATION: a Node major mismatch fails — it would silently invalidate every other result', () => {
    const fail = ACTION_HANDLERS['actions/setup-node']({ with: { 'node-version': '18' } });
    expect(fail.state).toBe('failed');
    const ok = ACTION_HANDLERS['actions/setup-node']({
      with: { 'node-version': process.versions.node.split('.')[0] },
    });
    expect(ok.state).toBe('asserted');
  });

  it('MUTATION: an artifact path that does not exist fails — CI would upload nothing', () => {
    expect(
      ACTION_HANDLERS['actions/upload-artifact']({ with: { path: 'docs/NOPE.md' } }).state,
    ).toBe('failed');
    expect(
      ACTION_HANDLERS['actions/upload-artifact']({ with: { path: 'docs/ACCESS-MATRIX.md' } }).state,
    ).toBe('asserted');
  });

  it('MUTATION: skipped steps never count toward the fidelity claim', () => {
    // The whole point: "CI passed locally" is worthless if a third of it was skipped.
    const s = summarize([
      { state: 'ran', label: 'a' },
      { state: 'skipped', label: 'b' },
      { state: 'asserted', label: 'c' },
      { state: 'skipped', label: 'd' },
    ]);
    expect(s.fidelity).toBe(0.25);
    expect(s.ok).toBe(true); // skips are reported, not fatal
    expect(s.counts.skipped).toBe(2);
  });

  it('MUTATION: any failed step fails the run', () => {
    const s = summarize([
      { state: 'ran', label: 'a' },
      { state: 'failed', label: 'npm run check' },
    ]);
    expect(s.ok).toBe(false);
    expect(s.failed).toEqual(['npm run check']);
  });

  it('every action the workflow actually uses has a handler', async () => {
    // Guards the drift where CI gains a step and the local verifier quietly stops covering it.
    const { readFileSync } = await import('node:fs');
    const { parse } = await import('yaml');
    const wf = parse(readFileSync('.github/workflows/check.yml', 'utf8'));
    const used = Object.values(wf.jobs as Record<string, { steps?: Array<{ uses?: string }> }>)
      .flatMap((j) => j.steps ?? [])
      .map((s) => String(s.uses ?? '').split('@')[0])
      .filter(Boolean);
    for (const a of used) expect(ACTION_HANDLERS[a], `${a} has no local handler`).toBeDefined();
  });
});

describe('working-directory is part of the command — F-72', () => {
  /**
   * The defect this pins could have destroyed a developer's data, and the tool would have said it
   * was faithful while doing it.
   *
   * `check.yml`'s `upgrade` job runs `supabase start && supabase db reset` with
   * `working-directory: /tmp/scaffold` — a throwaway project CI creates earlier in the same job.
   * `planStep` dropped the key, so the command was spawned with the repository root as its cwd,
   * against the developer's own local database, under a summary line reading "executed exactly as
   * CI will". A fidelity claim that is wrong in the destructive direction is worse than none.
   */
  const destructive = {
    name: "the buyer's stack, at their own schema",
    'working-directory': '/tmp/scaffold',
    run: 'supabase start && supabase db reset',
  };

  it('MUTATION: a step whose working-directory is absent locally is skipped, not run here', () => {
    const plan = planStep(destructive, { dirExists: () => false });
    expect(plan.state).toBe('skipped');
    expect(plan.cmd, 'a skipped step must carry no command to spawn').toBeUndefined();
    expect(plan.detail).toMatch(/\/tmp\/scaffold does not exist locally/);
  });

  it('MUTATION: when the directory does exist, the command runs THERE and not here', () => {
    const plan = planStep(destructive, { dirExists: () => true, full: true });
    expect(plan.cwd, 'cwd must be the declared working-directory').toBe('/tmp/scaffold');
    expect(plan.cwd).not.toBe(process.cwd());
  });

  it("a destructive command is heavy, which is the other half of that list's purpose", () => {
    // Defence in depth: even with the directory present, `db reset` needs --full.
    const plan = planStep(destructive, { dirExists: () => true });
    expect(plan.state).toBe('skipped');
    expect(plan.detail).toMatch(/drops and recreates/);
  });

  it('SAFETY: no step in the real workflow plans to run destructively in this repository', () => {
    // The property, asserted over the actual file rather than a fixture — because the fixture is
    // the thing that was right while the workflow was wrong.
    const wf = parse(readFileSync('.github/workflows/check.yml', 'utf8')) as {
      jobs: Record<string, { steps?: Record<string, unknown>[] }>;
    };
    const offenders: string[] = [];
    for (const [jobName, job] of Object.entries(wf.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        const plan = planStep(step, { full: true, dirExists: () => true });
        const run = typeof step.run === 'string' ? step.run : '';
        const destructiveHere =
          /db reset|rm -rf/.test(run) && plan.cmd && (plan.cwd ?? process.cwd()) === process.cwd();
        if (destructiveHere) offenders.push(`${jobName}: ${run.split('\n')[0]}`);
      }
    }
    expect(offenders, 'a destructive CI step would run against the developer’s own tree').toEqual(
      [],
    );
  });
});
