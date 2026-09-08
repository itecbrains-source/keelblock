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
      [spec({ evidence: [{ ac: 'AC-1', path: 'gone.sql', status: 'done' }] })],
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
            evidence: [{ ac: 'AC-9', path: 'later.ts', status: 'planned' }],
          }),
        ],
        no,
      ),
    ).toEqual([]);
  });

  it('MUTATION: a glob is refused — it cannot be verified, so it is not evidence', () => {
    const p = checkContracts(
      [spec({ evidence: [{ ac: 'AC-1', path: 'tests/*.sql', status: 'done' }] })],
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
