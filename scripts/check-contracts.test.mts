import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parseSpec, checkContracts, checkStatusAgreement } from './check-contracts.mjs';

const real = readdirSync('spec')
  .filter((f) => /^SPEC-\d+/.test(f))
  .map((f) => parseSpec(f.slice(0, 8), readFileSync(`spec/${f}`, 'utf8')));
const spec = (over = {}) => ({
  id: 'SPEC-001',
  status: 'done',
  contracts: [],
  evidence: [],
  ...over,
});
const yes = () => true,
  no = () => false;

describe('contracts gate', () => {
  it('the real spec set passes both rules', () => {
    expect(checkContracts(real, (p: string) => existsSync(p))).toEqual([]);
    expect(checkStatusAgreement(real, readFileSync('spec/README.md', 'utf8'))).toEqual([]);
  });

  it('parses status, contracts and per-AC evidence out of a real spec', () => {
    const s = real.find((x) => x.id === 'SPEC-001')!;
    expect(s.status).toBe('done');
    expect(s.contracts).toContain('SPEC-002');
    expect(s.evidence.length).toBeGreaterThan(5);
  });

  // ── mutation proofs ────────────────────────────────────────────────────────

  it('MUTATION: a done criterion citing a file that does not exist fails', () => {
    const p = checkContracts(
      [
        spec({
          evidence: [{ ac: 'AC-1', paths: ['gone.sql'], status: 'done', cited: '`gone.sql`' }],
        }),
      ],
      no,
    );
    expect(p[0]).toMatch(/a claim, not a record/);
  });

  it('a PLANNED criterion may cite a file that does not exist — it is a plan', () => {
    // Without this the gate nags on every draft spec and gets ignored, which is worse than absent.
    expect(
      checkContracts(
        [
          spec({
            status: 'partial',
            evidence: [{ ac: 'AC-9', paths: ['later.ts'], status: 'planned', cited: '`later.ts`' }],
          }),
        ],
        no,
      ),
    ).toEqual([]);
  });

  it('MUTATION: a glob is refused — it cannot be verified, so it is not evidence', () => {
    const p = checkContracts(
      [
        spec({
          evidence: [
            { ac: 'AC-1', paths: ['tests/*.sql'], status: 'done', cited: '`tests/*.sql`' },
          ],
        }),
      ],
      yes,
    );
    expect(p[0]).toMatch(/cites a glob/);
  });

  it('MUTATION: a one-way contract fails — invisible from the side that would break', () => {
    const a = spec({ id: 'SPEC-001', contracts: ['SPEC-002'] });
    const b = spec({ id: 'SPEC-002', contracts: [] });
    const p = checkContracts([a, b], yes);
    expect(p[0]).toMatch(/does not name SPEC-001 back/);
  });

  it('a reciprocal contract passes', () => {
    const a = spec({ id: 'SPEC-001', contracts: ['SPEC-002'] });
    const b = spec({ id: 'SPEC-002', contracts: ['SPEC-001'] });
    expect(checkContracts([a, b], yes)).toEqual([]);
  });

  it('MUTATION: a contract pointing at a spec that does not exist fails', () => {
    const p = checkContracts([spec({ contracts: ['SPEC-999'] })], yes);
    expect(p[0]).toMatch(/not an authored spec/);
  });

  it('MUTATION: index and spec file disagreeing about status fails', () => {
    // This happened: SPEC-001 and SPEC-003 read done in the index and draft in their own headers
    // for several commits, and the evidence rule silently passed because of it.
    const p = checkStatusAgreement(
      [spec({ status: 'draft' })],
      '| SPEC-001 | Tenancy | B-2 | 001 | **done** |',
    );
    expect(p[0]).toMatch(/index says "done", the spec file says "draft"/);
  });

  it('agreeing statuses pass', () => {
    expect(
      checkStatusAgreement([spec({ status: 'done' })], '| SPEC-001 | x | B-2 | 001 | **done** |'),
    ).toEqual([]);
  });
});

// ── R-2 / R-3: the two ways evidence checking used to be optional ──────────────
// The parser captured the FIRST backticked token and required the cell to begin with one. So a
// criterion could cite any number of missing files as long as its first existed, and a criterion
// whose evidence read as prose was not parsed at all — never checked, and silent about it.

describe('evidence parsing', () => {
  const row = (ac: string, evidence: string, status = '**done**') =>
    `| ${ac} | REQ-1 | test | ${evidence} | ${status} |`;
  const spec = (rows: string[]) =>
    parseSpec('SPEC-001', ['> Status: `partial`', '', ...rows].join('\n'));

  it('captures EVERY path in a cell, not only the first', () => {
    const s = parseSpec('SPEC-001', row('AC-1', '`a/first.yml` and `b/second.yml`'));
    expect(s.evidence[0].paths).toEqual(['a/first.yml', 'b/second.yml']);
  });

  it('MUTATION: a second cited file that does not exist fails', () => {
    // The real defect: SPEC-002 AC-7 cited check.yml and nightly.yml, the second did not exist, and
    // the gate reported "all evidence present" because it only ever looked at the first.
    const s = spec([row('AC-7', '`.github/workflows/check.yml` and `nightly.yml`')]);
    const problems = checkContracts([s], (p) => p !== 'nightly.yml');
    expect(problems.join(' ')).toContain('nightly.yml');
  });

  it('MUTATION: a done criterion whose evidence is prose fails instead of being skipped', () => {
    // SPEC-003 AC-7 and AC-8 were both invisible to the gate for exactly this reason.
    const s = spec([row('AC-7', 'Playbook gates wired, with a proof for each')]);
    expect(s.evidence).toHaveLength(1); // parsed, where it used to vanish
    expect(checkContracts([s], () => true).join(' ')).toContain('cites nothing checkable');
  });

  it('a backticked word that is not a path is not demanded as a file', () => {
    // `hreflang` and `@defer` are legitimately backticked. Demanding them as files is how a gate
    // teaches authors to delete backticks — which turns the check off for that row.
    const s = parseSpec('SPEC-001', row('AC-1', 'derives `hreflang` from `docs/adr/ADR-010.md`'));
    expect(s.evidence[0].paths).toEqual(['docs/adr/ADR-010.md']);
  });

  it('and removing the backticks cannot dodge it — zero paths still fails', () => {
    const s = spec([row('AC-1', 'derives hreflang correctly')]);
    expect(checkContracts([s], () => true).join(' ')).toContain('cites nothing checkable');
  });

  it('a planned criterion citing nothing is fine — a plan is not a record', () => {
    const s = spec([row('AC-1', 'still being designed', 'planned')]);
    expect(checkContracts([s], () => true)).toEqual([]);
  });
});
