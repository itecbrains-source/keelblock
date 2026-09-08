import { describe, expect, it } from 'vitest';
import { census, checkCountClaims, claimsIn, COUNTABLE, numberOf } from './status.mjs';

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

  it('MUTATION: a SPELLED-OUT number is caught — the old premise was false here', () => {
    // This test previously asserted the opposite, on the reasoning that "a spelled-out number is
    // almost always prose about the concept, not a claim about the count". That is an empirical
    // claim about how humans write, and in this repository it was wrong: EVERY stale count was
    // spelled out. Eighteen of them, including the line in AGENTS.md that told a coding agent the
    // decision record held eleven entries when it held fifteen — an agent that believes it will not
    // go looking for the other four.
    const p = checkCountClaims({ 'd.md': 'twelve gates guard this repository' }, c);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('twelve gates');
  });

  it('MUTATION: the number that was actually wrong on the front page is caught', () => {
    expect(checkCountClaims({ 'AGENTS.md': '`docs/adr/` — eleven decisions' }, c)).toHaveLength(1);
  });

  it('an inline code span is a QUOTATION, not a claim', () => {
    // Without this, a finding about a stale count cannot quote the stale count, and the rule
    // becomes one you are unable to document inside the repository it governs.
    expect(
      checkCountClaims({ 'd.md': 'claiming `twelve gates` where there were eleven' }, c),
    ).toEqual([]);
  });

  it('but a fenced transcript IS a claim, because a reader acts on it', () => {
    // The worst instance was a fenced block in README.md showing `npm run check` printing six
    // ticks. A reader who runs the command sees thirteen.
    const doc = ['```', '✓ six gates', '```'].join('\n');
    expect(checkCountClaims({ 'README.md': doc }, c)).toHaveLength(1);
  });

  it('the numeral vocabulary covers what this repository actually writes', () => {
    for (const word of ['six', 'eight', 'eleven', 'twelve', 'thirteen', 'sixteen', 'nineteen']) {
      expect(
        checkCountClaims({ 'd.md': `${word} gates` }, c).length,
        `"${word}" is not recognized as a number`,
      ).toBe(word === 'eleven' ? 0 : 1); // eleven is the true gate count
    }
  });

  it('numberOf reads both forms, and nothing else', () => {
    expect(numberOf('12')).toBe(12);
    expect(numberOf('twelve')).toBe(12);
    expect(numberOf('Twelve')).toBe(12);
    expect(numberOf('gazillion')).toBeUndefined();
  });

  it('claimsIn strips inline spans and keeps fences', () => {
    expect(claimsIn('a `six gates` b')).not.toContain('six gates');
    expect(claimsIn('```\nsix gates\n```')).toContain('six gates');
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
