import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { checkRegister, parseDispositions, parseFindings, summarize } from './review-register.mjs';

/**
 * The rule that keeps an external review from going stale in either direction: the record is frozen
 * and the answers are checked. Every case below is a way a register rots in practice.
 */
const AUDIT = 'docs/review/01-AUDIT.md';
const REGISTER = 'docs/review/DISPOSITIONS.md';

const finding = (id: string) => ({ id, severity: 'HIGH', title: 't' });
const row = (o: Partial<ReturnType<typeof parseDispositions>[number]>) => ({
  id: 'R-1',
  disposition: 'implemented',
  evidence: '`scripts/status.mjs`',
  note: 'a reason long enough to be an actual reason',
  paths: ['scripts/status.mjs'],
  defs: [],
  ...o,
});
const deps = (o = {}) => ({
  exists: () => true,
  openDefs: ['DEF-003'],
  allDefs: ['DEF-003', 'DEF-009'],
  ...o,
});

describe('review register', () => {
  it('reads the findings from the audit itself, not from a list kept beside it', () => {
    const ids = parseFindings(readFileSync(AUDIT, 'utf8')).map((f) => f.id);
    expect(ids).toContain('R-1');
    expect(ids).toContain('R-14');
    expect(new Set(ids).size, 'duplicate finding ids').toBe(ids.length);
  });

  it('the real register answers every real finding, and the review is CLOSED', () => {
    const findings = parseFindings(readFileSync(AUDIT, 'utf8'));
    const rows = parseDispositions(readFileSync(REGISTER, 'utf8'));
    const registry = readFileSync('spec/DEFERRAL_REGISTRY.md', 'utf8');
    expect(
      checkRegister(findings, rows, {
        exists: (p: string) => existsSync(p),
        openDefs: registry.split(/^## Closed/m)[0].match(/DEF-\d+/g) ?? [],
        allDefs: registry.match(/DEF-\d+/g) ?? [],
      }),
    ).toEqual([]);
    expect(summarize(findings, rows).closed).toBe(true);
  });

  // ── mutation proofs ─────────────────────────────────────────────────────────

  it('MUTATION: a finding with no disposition fails', () => {
    const problems = checkRegister([finding('R-1'), finding('R-2')], [row({})], deps());
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('R-2');
    expect(problems[0]).toContain('no disposition');
  });

  it('MUTATION: a disposition that outlives its finding fails', () => {
    // The other direction, and the one nobody looks for: the audit is edited, the row is not.
    const problems = checkRegister([finding('R-1')], [row({}), row({ id: 'R-99' })], deps());
    expect(problems.join(' ')).toContain('R-99');
    expect(problems.join(' ')).toContain('no such finding');
  });

  it('MUTATION: "implemented" citing a file that no longer exists fails', () => {
    // Delete the fix, and the claim that it was fixed goes red with it.
    const problems = checkRegister([finding('R-1')], [row({})], deps({ exists: () => false }));
    expect(problems.join(' ')).toContain('does not exist');
  });

  it('MUTATION: "deferred" against a CLOSED deferral fails — the ratchet', () => {
    // The single most valuable rule here. DEF-003 closes the day a remote exists, and R-13 must
    // then be answered again instead of sitting at "deferred" about work that shipped.
    const problems = checkRegister(
      [finding('R-13')],
      [
        row({
          id: 'R-13',
          disposition: 'deferred',
          evidence: 'DEF-009',
          paths: [],
          defs: ['DEF-009'],
        }),
      ],
      deps(),
    );
    expect(problems.join(' ')).toContain('is CLOSED');
  });

  it('MUTATION: "deferred" naming no deferral fails', () => {
    const problems = checkRegister(
      [finding('R-1')],
      [row({ disposition: 'deferred', evidence: 'later', paths: [], defs: [] })],
      deps(),
    );
    expect(problems.join(' ')).toContain('names no DEF');
  });

  it('MUTATION: "deferred" to a deferral that is not in the registry fails', () => {
    const problems = checkRegister(
      [finding('R-1')],
      [row({ disposition: 'deferred', evidence: 'DEF-404', paths: [], defs: ['DEF-404'] })],
      deps(),
    );
    expect(problems.join(' ')).toContain('not in the deferral registry');
  });

  it('MUTATION: a fourth disposition cannot be invented', () => {
    const problems = checkRegister([finding('R-1')], [row({ disposition: 'wontfix' })], deps());
    expect(problems.join(' ')).toContain('wontfix');
  });

  it('MUTATION: an answer with no reasoning fails', () => {
    const problems = checkRegister([finding('R-1')], [row({ note: 'done' })], deps());
    expect(problems.join(' ')).toContain('carries no reasoning');
  });

  it('MUTATION: "implemented" citing nothing checkable fails', () => {
    const problems = checkRegister(
      [finding('R-1')],
      [row({ evidence: 'fixed', paths: [] })],
      deps(),
    );
    expect(problems.join(' ')).toContain('cites nothing checkable');
  });

  it('a review with an unanswered finding is not closed', () => {
    expect(summarize([finding('R-1'), finding('R-2')], [row({})])).toMatchObject({
      closed: false,
      open: ['R-2'],
    });
  });

  it('an empty audit is not "closed" by vacuous truth', () => {
    expect(summarize([], []).closed).toBe(false);
  });
});
