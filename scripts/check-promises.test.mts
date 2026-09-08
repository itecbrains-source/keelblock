import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseBars, parseCoverage, checkBarCoverage } from './check-promises.mjs';

const all = { isRegistered: () => true, isAuthored: () => true };
const bars = [{ id: 'B-1', claim: 'scaffolds in five minutes' }];

describe('promises gate', () => {
  it('reads the real PRODUCT.md bars and the real coverage table', () => {
    const real = parseBars(readFileSync('docs/PRODUCT.md', 'utf8'));
    const cov = parseCoverage(readFileSync('spec/README.md', 'utf8'));
    expect(real.length).toBeGreaterThanOrEqual(10);
    for (const bar of real) expect(cov[bar.id], `${bar.id} unmapped`).toBeDefined();
  });

  // ── mutation proofs ────────────────────────────────────────────────────────

  it('MUTATION: a bar with no owner fails — the exact defect this gate exists for', () => {
    // B-3 promised "staleness fails the build" while no freshness gate existed, for a week, and
    // nothing in the repository noticed. This is the check that would have.
    const r = checkBarCoverage(bars, {}, all);
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatch(/nothing accountable for it/);
  });

  it('MUTATION: a dangling spec reference fails — it reads as coverage and is not', () => {
    const r = checkBarCoverage(
      bars,
      { 'B-1': ['SPEC-999'] },
      { ...all, isRegistered: () => false },
    );
    expect(r.problems[0]).toMatch(/dangling reference reads as coverage/);
  });

  it('a registered-but-unwritten spec is honest planning, not a failure', () => {
    const r = checkBarCoverage(
      bars,
      { 'B-1': ['SPEC-011'] },
      { isRegistered: () => true, isAuthored: () => false },
    );
    expect(r.problems).toEqual([]);
    expect(r.pending).toEqual(['B-1 → SPEC-011 (registered, not yet authored)']);
  });

  it('MUTATION: an empty owner list is treated as no owner, not as satisfied', () => {
    expect(checkBarCoverage(bars, { 'B-1': [] }, all).problems).toHaveLength(1);
  });

  it('parses the coverage TABLE, not prose — a gate reading prose reports its own bugs', () => {
    // The first version parsed a sentence and broke on a line wrap and on bare spec numbers,
    // reporting eight false failures.
    const cov = parseCoverage('| B-4 | SPEC-002, SPEC-003 |\n| B-9 | SPEC-003, SPEC-016 |');
    expect(cov['B-4']).toEqual(['SPEC-002', 'SPEC-003']);
  });

  it('ignores non-spec text in the owner column rather than inventing an owner', () => {
    expect(parseCoverage('| B-1 | tbd |')['B-1']).toEqual([]);
  });
});
