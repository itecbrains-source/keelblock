import { describe, expect, it } from 'vitest';
import { evaluate, render } from './access-matrix.mjs';

/** A clean two-identity report: a member reaches the row, an outsider does not. */
const clean = {
  tables: [
    {
      table: 'project',
      rls_enabled: true,
      policied: ['SELECT', 'INSERT'],
      idgrid: {
        SELECT: {
          authorized: { exp: true, pass: true },
          other: { exp: false, pass: true },
          anon: { exp: false, pass: true },
          service_role: { exp: true, pass: true },
        },
        INSERT: {
          authorized: { exp: true, pass: true },
          other: { exp: false, pass: true },
          anon: { exp: false, pass: true },
          service_role: { exp: true, pass: true },
        },
      },
    },
  ],
  bypass_surfaces: [],
};

const clone = (o: unknown) => JSON.parse(JSON.stringify(o));

describe('access matrix', () => {
  it('renders a clean report with no anomalies', () => {
    const out = render(clean);
    expect(out).toContain('**No anomalies.**');
    expect(out).not.toContain('REACHABLE');
  });

  it('names the identity that actually matters', () => {
    // If this row is ever renamed to something bland, the matrix stops being readable by a stranger,
    // which is the entire reason it is published.
    expect(render(clean)).toContain('Authenticated · different organization');
  });

  // ── mutation proofs (SPEC-002 REQ-5) ───────────────────────────────────────
  // Each restores a real defect and asserts the artifact goes loud. A gate that has only ever
  // printed a tick has not been shown to be looking at anything.

  it('MUTATION: a cross-tenant read is rendered as REACHABLE, not as a tick', () => {
    const leaking = clone(clean);
    leaking.tables[0].idgrid.SELECT.other = { exp: false, pass: false }; // denied by intent, permitted in fact
    const out = render(leaking);
    expect(out).toContain('REACHABLE');
    expect(out).toContain('⚠ 1 anomaly');
    expect(out).not.toContain('**No anomalies.**');
  });

  it('MUTATION: several leaks are counted, not collapsed into one warning', () => {
    const leaking = clone(clean);
    leaking.tables[0].idgrid.SELECT.other = { exp: false, pass: false };
    leaking.tables[0].idgrid.INSERT.other = { exp: false, pass: false };
    expect(render(leaking)).toContain('⚠ 2 anomalies');
  });

  it('MUTATION: RLS switched off is stated in bold, not implied by an empty row', () => {
    const off = clone(clean);
    off.tables[0].rls_enabled = false;
    expect(render(off)).toContain('⚠ DISABLED');
  });

  it('MUTATION: a table with no policies says so rather than rendering an empty table', () => {
    const bare = clone(clean);
    bare.tables[0].policied = [];
    expect(render(bare)).toContain('**no policies**');
  });

  it('MUTATION: a bypass surface is listed with its severity', () => {
    const withBypass = clone(clean);
    withBypass.bypass_surfaces = [
      { severity: 'CRITICAL', object: 'is_org_member(uuid)', reason: 'callable by anon' },
    ];
    const out = render(withBypass);
    expect(out).toContain('CRITICAL');
    expect(out).toContain('is_org_member(uuid)');
    expect(out).not.toContain('_None._');
  });

  it('is deterministic — tables and bypass rows are ordered, so a diff means a real change', () => {
    const a = clone(clean);
    const b = clone(clean);
    a.tables = [
      { ...a.tables[0], table: 'zeta' },
      { ...a.tables[0], table: 'alpha' },
    ];
    b.tables = [
      { ...b.tables[0], table: 'alpha' },
      { ...b.tables[0], table: 'zeta' },
    ];
    expect(render(a)).toBe(render(b));
  });

  it('a blocked-but-expected-allowed cell is flagged too — silent over-tightening is also a defect', () => {
    const tight = clone(clean);
    tight.tables[0].idgrid.SELECT.authorized = { exp: true, pass: false };
    expect(render(tight)).toContain('blocked but should be allowed');
  });
});

// ── the artifact's CONTENT must be able to fail the build ──────────────────────
// Before this, `render()` counted anomalies, printed the count and returned a string: the number
// never reached a caller, was never thresholded, and `--check` compared text. So a matrix reporting a
// cross-tenant leak passed the gate, provided the committed copy already contained the leak. The
// gate protected the freshness of the evidence and was indifferent to what it said.

const leak = () => {
  const r = clone(clean);
  r.tables[0].idgrid.SELECT.other = { exp: false, pass: false };
  return r;
};
const critical = () => {
  const r = clone(clean);
  r.bypass_surfaces = [{ severity: 'CRITICAL', object: 'etl_admin', reason: 'bypasses RLS' }];
  return r;
};
const REASON = 'adjudicated 2026-09-08: denied at the privilege layer, reproduced';

describe('access matrix · adjudication', () => {
  it('a clean report with no allowances has nothing to answer', () => {
    expect(evaluate(clean, []).problems).toEqual([]);
  });

  it('MUTATION: an unexplained anomaly fails, and names the exact cell', () => {
    const { problems } = evaluate(leak(), []);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('project');
    expect(problems[0]).toContain('SELECT');
    expect(problems[0]).toContain('other');
  });

  it('MUTATION: an unexplained CRITICAL bypass surface fails', () => {
    const { problems } = evaluate(critical(), []);
    expect(problems.join(' ')).toContain('etl_admin');
  });

  it('an allowance with a real reason answers its concern', () => {
    const key = evaluate(leak(), []).concerns[0].key;
    const { problems, adjudicated } = evaluate(leak(), [{ key, reason: REASON }]);
    expect(problems).toEqual([]);
    expect(adjudicated).toHaveLength(1);
  });

  it('MUTATION: an allowance with a token reason silences nothing', () => {
    // "ok" must not be able to retire a cross-tenant leak.
    const key = evaluate(leak(), []).concerns[0].key;
    const { problems } = evaluate(leak(), [{ key, reason: 'ok' }]);
    expect(problems.join(' ')).toContain('reason');
    expect(problems.join(' ')).toContain(key);
  });

  it('MUTATION: an allowance that matches nothing fails, so the list cannot rot', () => {
    const { problems } = evaluate(clean, [{ key: 'anomaly:project.SELECT.other', reason: REASON }]);
    expect(problems.join(' ')).toContain('matches nothing');
  });

  it('the reason is published in the artifact, not only in a config file', () => {
    const key = evaluate(leak(), []).concerns[0].key;
    const out = render(leak(), { allowances: [{ key, reason: REASON }] });
    expect(out).toContain('Adjudicated');
    expect(out).toContain(REASON);
  });

  it('the summary separates what was answered from what was not', () => {
    expect(render(leak(), { allowances: [] })).toContain('1 unexplained');
    const key = evaluate(leak(), []).concerns[0].key;
    expect(render(leak(), { allowances: [{ key, reason: REASON }] })).toContain('0 unexplained');
  });

  it('render and evaluate agree on what an anomaly is — one predicate, not two', () => {
    // The recurring defect in this repository is one question answered by two resolvers that drift.
    const r = leak();
    const cells = (render(r).match(/⚠ (\*\*REACHABLE\*\*|blocked but should be allowed)/g) ?? [])
      .length;
    expect(cells).toBe(evaluate(r, []).concerns.filter((c) => c.kind === 'anomaly').length);
  });
});
