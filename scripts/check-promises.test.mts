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

describe('registration is read from the spec index, not from the file', () => {
  // The rule shipped circular: it asked whether `| SPEC-nnn |` appeared anywhere in
  // spec/README.md, and the COVERAGE row doing the naming satisfied that. Measured on the real
  // file — B-3 pointed at SPEC-999, which has never existed, and the gate reported
  // "B-3 → SPEC-999 (registered, not yet authored)" and stayed green.
  const isRegistered = (id: string, index: string) =>
    index.split('\n').some((line) => {
      const cells = line.split('|').map((c) => c.replace(/\*/g, '').trim());
      return cells.length >= 6 && cells[1] === id;
    });

  const indexRow = '| SPEC-003 | Gates — freshness | B-3 | 004, 007 | **done** |';
  const coverageRow = '| B-3  | SPEC-999 |';

  it('MUTATION: a coverage row alone does NOT register the spec it names', () => {
    expect(isRegistered('SPEC-999', coverageRow)).toBe(false);
  });

  it('an index row does register it', () => {
    expect(isRegistered('SPEC-003', indexRow)).toBe(true);
  });

  it('and the real index registers every spec that has a file', async () => {
    // Non-vacuous: if the cell-count heuristic stopped matching the real table, this catches it
    // rather than silently reporting everything unregistered.
    const { readFileSync, readdirSync } = await import('node:fs');
    const index = readFileSync('spec/README.md', 'utf8');
    const authored = readdirSync('spec')
      .filter((f) => /^SPEC-\d+/.test(f))
      .map((f) => f.slice(0, 8));
    expect(authored.length).toBeGreaterThan(3);
    for (const id of authored) expect(isRegistered(id, index)).toBe(true);
  });
});
