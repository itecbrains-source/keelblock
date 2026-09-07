import { describe, expect, it } from 'vitest';
import { STEPS, EXIT, decideRun, summarize } from './check.mjs';

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
    const s = summarize([r('typecheck', false), r('lint', false), r('unit', true), r('matrix', false)]);
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

  it('the isolation gates are marked as needing the database', () => {
    for (const id of ['policy', 'matrix']) {
      expect(STEPS.find((s) => s.id === id)!.needsDb).toBe(true);
    }
  });
});
