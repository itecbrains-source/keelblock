import { describe, expect, it } from 'vitest';
import { census, checkCountClaims, COUNTABLE } from './status.mjs';

const c = census();

describe('derived status', () => {
  it('computes the census from the repository, not from a stored file', () => {
    expect(c.findings).toBeGreaterThanOrEqual(22);
    expect(c.gates).toBeGreaterThanOrEqual(8);
    expect(c.specs.length).toBeGreaterThanOrEqual(5);
    expect(c.adrs).toBeGreaterThanOrEqual(12);
  });

  it('the real documentation asserts no stale count', () => {
    expect(checkCountClaims({ 'x.md': '' }, c)).toEqual([]);
  });

  // ── mutation proofs ────────────────────────────────────────────────────────

  it('MUTATION: a document claiming the wrong number of findings is caught', () => {
    // The exact failure: prose says 22, reality says 23, and a reader believes the prose.
    const p = checkCountClaims(
      { 'README.md': `keelblock has ${c.findings + 1} findings with repros.` },
      c,
    );
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/goes stale the moment reality moves/);
  });

  it('MUTATION: every countable noun is actually checked, not just the first', () => {
    const doc = Object.keys(COUNTABLE)
      .map((noun) => `We have 999 ${noun}.`)
      .join('\n');
    expect(checkCountClaims({ 'd.md': doc }, c)).toHaveLength(Object.keys(COUNTABLE).length);
  });

  it('a correct count passes — the gate is not simply hostile to numbers', () => {
    expect(checkCountClaims({ 'd.md': `${c.findings} findings` }, c)).toEqual([]);
  });

  it('bold markup around the number does not evade the check', () => {
    expect(checkCountClaims({ 'd.md': `${c.findings + 5} **findings**` }, c)).toHaveLength(1);
  });

  it('a spelled-out number is left alone — it is prose about the concept, not a claim', () => {
    // "twelve gates" in a sentence is not a count anyone will act on; flagging it would make the
    // gate annoying enough to be disabled, which costs more than the drift it prevents.
    expect(checkCountClaims({ 'd.md': 'twelve gates guard this repository' }, c)).toEqual([]);
  });

  it('every AC status is a closed vocabulary — nothing invents its own', () => {
    const allowed = /^(planned|done|deferred.*)$/i;
    for (const s of c.specs) {
      for (const ac of s.acs) {
        expect(allowed.test(ac), `${s.id} has an acceptance status "${ac}"`).toBe(true);
      }
    }
  });

  it('a spec marked done has every criterion closed — the closure rule, on the real repo', () => {
    for (const s of c.specs.filter((x) => x.status === 'done')) {
      expect(
        s.acs.filter((a) => a !== 'done'),
        `${s.id} is done with open criteria`,
      ).toEqual([]);
    }
  });
});
