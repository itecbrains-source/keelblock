import { describe, expect, it } from 'vitest';
import {
  census,
  checkCountClaims,
  checkStateClaims,
  countPages,
  claimsIn,
  COUNTABLE,
  numberOf,
} from './status.mjs';

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
    // The fixture says eleven, which was true until 2026-09-10 and is exactly the kind of number
    // that goes stale without anyone editing the sentence containing it.
    const p = checkCountClaims({ 'd.md': 'eleven gates guard this repository' }, c);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('eleven gates');
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
    // 'twelve' is the true count since 2026-09-10: `unused` gained an implementation file
    // (`check-unused.mjs`) so knip's expired-exemption hints could fail the build (F-68). The
    // RUNNER still lists the same gates — what grew is the number of check-*.mjs files carrying a
    // mutation proof, which is what this count has always measured.
    for (const word of ['six', 'eight', 'eleven', 'twelve', 'thirteen', 'sixteen', 'nineteen']) {
      expect(
        checkCountClaims({ 'd.md': `${word} gates` }, c).length,
        `"${word}" is not recognized as a number`,
      ).toBe(word === 'twelve' ? 0 : 1); // twelve is the true gate count
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

  // ── state claims: the class a count rule cannot see ─────────────────────────

  it('MUTATION: the exact sentence pushing falsified is caught', () => {
    // Verbatim from README.md, true when written and false for the duration of the push that
    // created the remote — written by the same person who pushed.
    const doc =
      'There is no remote yet, so the workflow has never executed on GitHub. `npm run verify` closes as much of that gap as a laptop honestly can:';
    const p = checkStateClaims(
      { 'README.md': doc },
      { hasRemote: true, authShipped: false, unreleasedIsStale: false },
    );
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('no longer true');
  });

  it('the same sentence is fine while it is TRUE', () => {
    const doc = 'There is no remote yet, so the workflow has never executed on GitHub.';
    expect(
      checkStateClaims(
        { 'README.md': doc },
        { hasRemote: false, authShipped: false, unreleasedIsStale: false },
      ),
    ).toEqual([]);
  });

  it('the real documentation makes no state claim that has expired', () => {
    expect(
      checkStateClaims(
        { 'x.md': '' },
        { hasRemote: true, authShipped: false, unreleasedIsStale: false },
      ),
    ).toEqual([]);
  });

  it('a quotation is still a quotation here too', () => {
    // The review says "no remote" as a dated record and must keep saying it.
    expect(
      checkStateClaims(
        { 'd.md': 'the audit noted `no remote` on the day' },
        { hasRemote: true, authShipped: false, unreleasedIsStale: false },
      ),
    ).toEqual([]);
  });

  it('ordinary prose about remotes is not a claim about this one', () => {
    const doc = 'Push to your remote when ready; a remote branch is cheap.';
    expect(
      checkStateClaims(
        { 'd.md': doc },
        { hasRemote: true, authShipped: false, unreleasedIsStale: false },
      ),
    ).toEqual([]);
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

describe('state claims about the product surface', () => {
  const facts = { hasRemote: true, authShipped: true, unreleasedIsStale: false };

  it('MUTATION: the exact README sentence that shipping sign-in falsified is caught', () => {
    // Verbatim from README's first blockquote, in the same file that promises two paragraphs later
    // to describe "what exists today, not what is planned".
    const doc =
      '> **Status: foundation.** The tenancy layer, the proof harness and the gates are built and\n' +
      '> green. Auth, billing and the product surfaces are specced and not yet built.';
    const p = checkStateClaims({ 'README.md': doc }, facts);
    expect(p[0]).toMatch(/no longer true/);
    expect(p[0]).toMatch(/spec that owns sign-in is done or partial/);
  });

  it('the same sentence is fine while it is true', () => {
    const doc = 'Auth, billing and the product surfaces are specced and not yet built.';
    expect(checkStateClaims({ 'README.md': doc }, { ...facts, authShipped: false })).toEqual([]);
  });

  it('does not flag a different spec that is legitimately unbuilt', () => {
    // README says SPEC-016 is "not yet built" and that stays true. A rule that flagged every such
    // sentence would be exempted into uselessness inside a week.
    const doc = 'The release preflight (SPEC-016) — **not yet built.**';
    expect(checkStateClaims({ 'README.md': doc }, facts)).toEqual([]);
  });

  it('MUTATION: an Unreleased section that omits a shipped spec is caught', () => {
    const doc = '## [Unreleased]\n\nThe tenancy foundation and the gates.';
    const p = checkStateClaims({ 'CHANGELOG.md': doc }, { ...facts, unreleasedIsStale: true });
    expect(p[0]).toMatch(/predates work that has since shipped/);
  });

  it('an Unreleased section that names the shipped work passes', () => {
    const doc = '## [Unreleased]\n\nSPEC-001, SPEC-004.';
    expect(checkStateClaims({ 'CHANGELOG.md': doc }, facts)).toEqual([]);
  });
});

describe('countPages', () => {
  it('counts the real route tree, and only page files', () => {
    // The fact behind the `pages` noun. F-32's test for whether a state rule may exist at all is
    // that the state is observable to the repository — this is what makes it so.
    expect(countPages('src/app')).toBeGreaterThanOrEqual(2);
  });

  it('MUTATION: a stale page count in prose is caught', () => {
    // "it is paid here at one page" was true when written and false the moment sign-in shipped,
    // in the same commit, written by the same person.
    const p = checkCountClaims({ 'README.md': 'the cost is paid here at one page.' }, {
      ...census(),
      pages: 2,
    } as never);
    expect(p[0]).toMatch(/says "one pages?"|says "one page"/);
  });

  it('does not count a directory or a test file as a page', () => {
    const fs = {
      existsSync: () => true,
      readdirSync: (d: string) =>
        d === 'app' ? ['page.tsx', 'page.test.tsx', 'sub'] : ['page.tsx'],
      statSync: (p: string) => ({ isDirectory: () => p.endsWith('sub') }),
    };
    expect(countPages('app', fs as never)).toBe(2);
  });
});
