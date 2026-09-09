import { describe, expect, it } from 'vitest';
import { STEPS, EXIT, decideRun, summarize, REQUIRED_BINARIES, missingBinaries } from './check.mjs';
import { readFileSync } from 'node:fs';

const r = (id: string, ok: boolean) => ({ id, why: id, ms: 1000, status: ok ? 0 : 1 });

describe('check runner', () => {
  it('reports green only when every step passed', () => {
    const s = summarize([r('a', true), r('b', true)]);
    expect(s.ok).toBe(true);
    expect(s.exit).toBe(EXIT.OK);
  });

  // ── mutation proofs ────────────────────────────────────────────────────────

  it('MUTATION: one failing step fails the run and is named', () => {
    const s = summarize([r('typecheck', true), r('policy', false)]);
    expect(s.ok).toBe(false);
    expect(s.exit).toBe(EXIT.FAILED);
    expect(s.failed).toEqual(['policy']);
  });

  it('MUTATION: every failure is reported, not just the first', () => {
    // The behavior the runner exists for: a developer fixes all three in one pass.
    const s = summarize([
      r('typecheck', false),
      r('lint', false),
      r('unit', true),
      r('matrix', false),
    ]);
    expect(s.failed).toEqual(['typecheck', 'lint', 'matrix']);
    expect(s.lines.filter((l: string) => l.includes('✗'))).toHaveLength(3);
  });

  it('MUTATION: a missing database aborts rather than silently skipping the DB gates', () => {
    // Skipping would make `check` report green while proving nothing — the F-13 defect exactly.
    const d = decideRun(STEPS, { dbAvailable: false });
    expect(d.proceed).toBe(false);
    expect(d.exit).toBe(EXIT.CANNOT_RUN);
    expect(d.exit).not.toBe(EXIT.OK);
  });

  it('proceeds when the database is available', () => {
    expect(decideRun(STEPS, { dbAvailable: true }).proceed).toBe(true);
  });

  it('distinguishes "a gate failed" from "the run could not happen"', () => {
    expect(EXIT.FAILED).not.toBe(EXIT.CANNOT_RUN);
    expect(EXIT.OK).toBe(0);
  });

  // ── the step set itself is a contract ──────────────────────────────────────

  it('the unit gate never passes vacuously', () => {
    // F-13: `--passWithNoTests` against zero test files printed a green tick for weeks.
    const unit = STEPS.find((s) => s.id === 'unit')!;
    expect(unit.args).not.toContain('--passWithNoTests');
  });

  it('typegen runs before typecheck, or a clean clone cannot pass', () => {
    const ids = STEPS.map((s) => s.id);
    expect(ids.indexOf('typegen')).toBeLessThan(ids.indexOf('typecheck'));
  });

  it('a production build is one of the steps, because nothing else renders a page', () => {
    // F-51. `tsc --noEmit` exits 0 on a page whose component throws at render; `next build` exits 1
    // and names the page and the line. Before this step existed, the only build in the project was
    // inside the journey layer's Playwright webServer, so that failure arrived as "the web server
    // did not start" — a message that sends the reader to look at ports (F-49).
    const build = STEPS.find((s) => s.id === 'build');
    expect(build, 'no step runs `next build`').toBeDefined();
    expect(build!.args).toContain('build');
  });

  it('build runs after typegen, for the same reason typecheck does', () => {
    const ids = STEPS.map((s) => s.id);
    expect(ids.indexOf('typegen')).toBeLessThan(ids.indexOf('build'));
  });

  it('the build step does not claim to need the database', () => {
    // Measured, not assumed: `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:59999 npx next build` exits
    // 0. Every route is partially prerendered, so the shell is built and each DB-touching part is
    // deferred to request time. Marking it needsDb would abort the whole run on a machine with no
    // stack, for a step that does not use one.
    expect(STEPS.find((s) => s.id === 'build')!.needsDb).toBeUndefined();
  });

  it('MUTATION: a missing system prerequisite is named, with how to install it', () => {
    // The README promises this. Without the test it is a promise, not a behavior.
    const missing = missingBinaries(REQUIRED_BINARIES, (b: string) => b !== 'psql');
    expect(missing).toHaveLength(1);
    expect(missing[0].bin).toBe('psql');
    expect(missing[0].install).toMatch(/brew/);
  });

  it('nothing is missing on a correctly set up machine', () => {
    expect(missingBinaries(REQUIRED_BINARIES, () => true)).toEqual([]);
  });

  it('every knip exemption is justified in knip.reasons.md, and the list may only shrink', () => {
    // knip reports genuinely dead code, so each exemption is a claim that something is not dead YET.
    // An exemption with no recorded reason is how dead code becomes permanent while looking supervised.
    const cfg = JSON.parse(readFileSync('knip.json', 'utf8'));
    const reasons = readFileSync('knip.reasons.md', 'utf8');
    const exemptions = [
      ...(cfg.ignore ?? []),
      ...(cfg.ignoreDependencies ?? []),
      ...(cfg.ignoreBinaries ?? []),
    ];
    for (const e of exemptions) {
      expect(
        reasons,
        `${e} is exempted in knip.json but not justified in knip.reasons.md`,
      ).toContain(e);
    }
    expect(exemptions.length).toBeLessThanOrEqual(13); // shrink-only ratchet
  });

  it('the isolation gates are marked as needing the database', () => {
    for (const id of ['policy', 'generated']) {
      expect(STEPS.find((s) => s.id === id)!.needsDb).toBe(true);
    }
  });
});

// ── R-12: a rule that did not run is not a rule that passed ────────────────────

describe('degraded steps', () => {
  const step = (id: string, status: number) => ({ id, why: id, ms: 0, status });

  it('renders a degraded step as ~, not as a tick', () => {
    const { lines } = summarize([step('freshness', EXIT.DEGRADED), step('unit', EXIT.OK)]);
    expect(lines[0]).toContain('~ freshness');
    expect(lines[1]).toContain('✓ unit');
  });

  it('MUTATION: a degraded run is not "all green"', () => {
    // The failure this prevents: the warning goes to stderr inside a thirteen-step run, and the
    // summary — the only line most people read — says everything is fine.
    const s = summarize([step('freshness', EXIT.DEGRADED)]);
    expect(s.ok, 'a run that skipped a rule must not report as green').toBe(false);
    expect(s.degraded).toEqual(['freshness']);
    // Exit stays 0 without --strict: a laptop on a hotel network must still be able to run this.
    expect(s.exit).toBe(EXIT.OK);
  });

  it('--strict turns degraded into failure, which is what CI uses', () => {
    // CI has a network, so an unreachable registry there is news rather than an environment quirk.
    const s = summarize([step('freshness', EXIT.DEGRADED)], { strict: true });
    expect(s.exit).toBe(EXIT.FAILED);
    expect(s.ok).toBe(false);
  });

  it('a real failure still dominates a degradation', () => {
    const s = summarize([step('freshness', EXIT.DEGRADED), step('policy', EXIT.FAILED)]);
    expect(s.exit).toBe(EXIT.FAILED);
    expect(s.failed).toEqual(['policy']);
    expect(s.degraded).toEqual(['freshness']);
  });

  it('an all-ok run is still exit 0 and still says all green', () => {
    const s = summarize([step('unit', EXIT.OK), step('lint', EXIT.OK)]);
    expect(s.ok).toBe(true);
    expect(s.exit).toBe(EXIT.OK);
    expect(s.degraded).toEqual([]);
  });
});
