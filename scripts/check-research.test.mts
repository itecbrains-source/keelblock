import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkResearch } from './check-research.mjs';

const manifest = JSON.parse(readFileSync('research/manifest.json', 'utf8'));
const base = {
  today: '2026-09-07',
  onDisk: manifest.memos.map((m: { file: string }) => m.file),
  specStatus: () => 'draft',
  authoredSpecs: [],
  readSource: (f: string) => readFileSync(`research/${f}`, 'utf8'),
};
const one = (over = {}) => ({
  volatility: { fast: { maxAgeDays: 90 } },
  memos: [{ file: 'x.md', area: 'x', volatility: 'fast', verifiedOn: '2026-09-01', kind: 'sourced', specs: ['SPEC-001'], ...over }],
});
const ctx = (over = {}) => ({
  today: '2026-09-07', onDisk: ['x.md'], specStatus: () => 'draft', authoredSpecs: [],
  readSource: () => '**Primary**\n- [a](https://example.com/doc)\n**Secondary**\n', ...over,
});

describe('research gate', () => {
  it('the real manifest passes every rule', () => {
    expect(checkResearch(manifest, base).problems).toEqual([]);
  });

  it('every authored spec is covered by a memo', () => {
    const authored = ['SPEC-001', 'SPEC-002', 'SPEC-003', 'SPEC-016', 'SPEC-028'];
    expect(checkResearch(manifest, { ...base, authoredSpecs: authored }).problems).toEqual([]);
  });

  // ── mutation proofs ────────────────────────────────────────────────────────

  it('MUTATION: a lapsed memo fails — knowledge rots faster than dependencies', () => {
    const p = checkResearch(one(), ctx({ today: '2027-01-01' })).problems;
    expect(p[0]).toMatch(/verified \d+d ago/);
  });

  it('MUTATION: a spec marked done on a lapsed memo is called out separately', () => {
    // The dangerous case: a done spec inherits an unverified conclusion while looking rigorous.
    const p = checkResearch(one(), ctx({ today: '2027-01-01', specStatus: () => 'done' })).problems;
    expect(p.join()).toMatch(/marked done on this lapsed memo/);
  });

  it('MUTATION: an authored spec with no memo fails — the rule that covers every feature', () => {
    const p = checkResearch(one({ specs: [] }), ctx({ authoredSpecs: ['SPEC-099'] })).problems;
    expect(p[0]).toMatch(/no research memo covers it/);
  });

  it('MUTATION: a sourced memo with no Primary section fails — this is how F-21 happened', () => {
    const p = checkResearch(one(), ctx({ readSource: () => '## Sources\n- [blog](https://blog.example)' })).problems;
    expect(p[0]).toMatch(/no "\*\*Primary\*\*" sources section/);
  });

  it('MUTATION: a Primary section citing nothing fails', () => {
    const p = checkResearch(one(), ctx({ readSource: () => '**Primary**\n\n**Secondary**\n- [b](https://x)' })).problems;
    expect(p[0]).toMatch(/cites no source/);
  });

  it('MUTATION: a measurement with no reproduction is an anecdote', () => {
    const p = checkResearch(one({ kind: 'measured' }), ctx({ readSource: () => 'we ran it and it was fine' })).problems;
    expect(p[0]).toMatch(/anecdote/);
  });

  it('a measurement WITH a reproduction passes, and is not asked for sources', () => {
    expect(checkResearch(one({ kind: 'measured' }), ctx({ readSource: () => '```sql\nselect 1;\n```' })).problems).toEqual([]);
  });

  it('MUTATION: an unlisted memo on disk fails — it would never be re-verified', () => {
    const p = checkResearch(one(), ctx({ onDisk: ['x.md', 'stray.md'] })).problems;
    expect(p[0]).toMatch(/not in the manifest/);
  });

  it('volatility is per-subject: SQL semantics and AI search do not decay alike', () => {
    const v = manifest.volatility;
    expect(v.fast.maxAgeDays).toBeLessThan(v.moderate.maxAgeDays);
    expect(v.moderate.maxAgeDays).toBeLessThan(v.stable.maxAgeDays);
  });

  it('warns before expiry rather than only at it', () => {
    const r = checkResearch(one(), ctx({ today: '2026-11-15' }));   // 75 of 90 days
    expect(r.problems).toEqual([]);
    expect(r.expiring[0]).toMatch(/d left/);
  });
});
