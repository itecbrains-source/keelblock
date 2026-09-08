import { describe, expect, it } from 'vitest';
import { compareGenerated } from './check-generated.mjs';

describe('generated-artifact gate', () => {
  it('identical content is current', () => {
    expect(compareGenerated('export type X = 1', 'export type X = 1')).toEqual([]);
  });

  // ── mutation proofs ────────────────────────────────────────────────────────

  it('MUTATION: a drifted artifact is caught, and the message says why it matters', () => {
    // The failure mode is specific: a stale row type does not fail to compile. It compiles, and it
    // is undefined in production, because the compiler was reading a description of a moved schema.
    const p = compareGenerated('export type X = 1', 'export type X = 2');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/does not fail to compile/);
    expect(p[0]).toMatch(/npm run generate/); // names the fix, not just the fault
  });

  it('MUTATION: a missing committed artifact is drift, not an absence to shrug at', () => {
    expect(compareGenerated('', 'export type X = 1')).toHaveLength(1);
  });

  it('whitespace counts — a diff is a diff', () => {
    expect(compareGenerated('a\n', 'a')).toHaveLength(1);
  });
});
