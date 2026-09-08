import { describe, expect, it } from 'vitest';
import { STEPS, EXIT, decideRun, summarize, REQUIRED_BINARIES, missingBinaries } from './check.mjs';
import { readFileSync } from 'node:fs';

const r = (id: string, ok: boolean) => ({ id, why: id, ok, ms: 1000 });

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
    // The behaviour the runner exists for: a developer fixes all three in one pass.
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

  it('MUTATION: a missing system prerequisite is named, with how to install it', () => {
    // The README promises this. Without the test it is a promise, not a behaviour.
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
