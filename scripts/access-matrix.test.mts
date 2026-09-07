import { describe, expect, it } from 'vitest';
import { render } from './access-matrix.mjs';

/** A clean two-identity report: a member reaches the row, an outsider does not. */
const clean = {
  tables: [{
    table: 'project',
    rls_enabled: true,
    policied: ['SELECT', 'INSERT'],
    idgrid: {
      SELECT: { authorized: { exp: true, pass: true }, other: { exp: false, pass: true },
                anon: { exp: false, pass: true }, service_role: { exp: true, pass: true } },
      INSERT: { authorized: { exp: true, pass: true }, other: { exp: false, pass: true },
                anon: { exp: false, pass: true }, service_role: { exp: true, pass: true } },
    },
  }],
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
    expect(render(clean)).toContain('Authenticated · different organisation');
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
    withBypass.bypass_surfaces = [{ severity: 'CRITICAL', object: 'is_org_member(uuid)', reason: 'callable by anon' }];
    const out = render(withBypass);
    expect(out).toContain('CRITICAL');
    expect(out).toContain('is_org_member(uuid)');
    expect(out).not.toContain('_None._');
  });

  it('is deterministic — tables and bypass rows are ordered, so a diff means a real change', () => {
    const a = clone(clean); const b = clone(clean);
    a.tables = [{ ...a.tables[0], table: 'zeta' }, { ...a.tables[0], table: 'alpha' }];
    b.tables = [{ ...b.tables[0], table: 'alpha' }, { ...b.tables[0], table: 'zeta' }];
    expect(render(a)).toBe(render(b));
  });

  it('a blocked-but-expected-allowed cell is flagged too — silent over-tightening is also a defect', () => {
    const tight = clone(clean);
    tight.tables[0].idgrid.SELECT.authorized = { exp: true, pass: false };
    expect(render(tight)).toContain('blocked but should be allowed');
  });
});
