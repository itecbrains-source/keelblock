import { describe, expect, it } from 'vitest';
import { planStep, summarize, ACTION_HANDLERS } from './verify.mjs';

describe('local CI verifier', () => {
  it('executes a plain run step exactly as CI would', () => {
    const p = planStep({ run: 'npm run check' });
    expect(p.state).toBe('ran');
    expect(p.cmd).toEqual(['bash', '-lc', 'npm run check']);
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
    const ok = ACTION_HANDLERS['actions/setup-node']({ with: { 'node-version': process.versions.node.split('.')[0] } });
    expect(ok.state).toBe('asserted');
  });

  it('MUTATION: an artifact path that does not exist fails — CI would upload nothing', () => {
    expect(ACTION_HANDLERS['actions/upload-artifact']({ with: { path: 'docs/NOPE.md' } }).state).toBe('failed');
    expect(ACTION_HANDLERS['actions/upload-artifact']({ with: { path: 'docs/ACCESS-MATRIX.md' } }).state).toBe('asserted');
  });

  it('MUTATION: skipped steps never count toward the fidelity claim', () => {
    // The whole point: "CI passed locally" is worthless if a third of it was skipped.
    const s = summarize([
      { state: 'ran', label: 'a' }, { state: 'skipped', label: 'b' },
      { state: 'asserted', label: 'c' }, { state: 'skipped', label: 'd' },
    ]);
    expect(s.fidelity).toBe(0.25);
    expect(s.ok).toBe(true);          // skips are reported, not fatal
    expect(s.counts.skipped).toBe(2);
  });

  it('MUTATION: any failed step fails the run', () => {
    const s = summarize([{ state: 'ran', label: 'a' }, { state: 'failed', label: 'npm run check' }]);
    expect(s.ok).toBe(false);
    expect(s.failed).toEqual(['npm run check']);
  });

  it('every action the workflow actually uses has a handler', async () => {
    // Guards the drift where CI gains a step and the local verifier quietly stops covering it.
    const { readFileSync } = await import('node:fs');
    const { parse } = await import('yaml');
    const wf = parse(readFileSync('.github/workflows/check.yml', 'utf8'));
    const used = Object.values(wf.jobs as Record<string, { steps?: Array<{ uses?: string }> }>)
      .flatMap((j) => j.steps ?? []).map((s) => String(s.uses ?? '').split('@')[0]).filter(Boolean);
    for (const a of used) expect(ACTION_HANDLERS[a], `${a} has no local handler`).toBeDefined();
  });
});
