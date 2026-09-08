import { describe, expect, it } from 'vitest';
import { planProbes, reconcileEmitted } from './check-policies.mjs';

const valid = {
  organization_member: {
    why: 'carries domain-invariant triggers',
    coveredBy: 'intent/003 (8 tests)',
  },
};

describe('policy probe plan', () => {
  it('probes every table that has no skip entry', () => {
    const { probe, skip } = planProbes(['organization', 'project'], {});
    expect(probe).toEqual(['organization', 'project']);
    expect(skip).toEqual([]);
  });

  it('a table is derived from the catalog, so a new one is probed without being added anywhere', () => {
    // The list of tables is read from pg_class at runtime; a new tenant table cannot be forgotten.
    const { probe } = planProbes(['organization', 'project', 'brand_new_table'], valid);
    expect(probe).toContain('brand_new_table');
  });

  // ── mutation proofs ────────────────────────────────────────────────────────

  it('MUTATION: a skip without `coveredBy` is refused — that is a hole, not a transfer', () => {
    // Without this, the skip list is the easiest place in the repository to hide lost coverage:
    // delete one word and a table silently stops being tested by anything.
    expect(() =>
      planProbes(['organization_member'], {
        organization_member: { why: 'triggers get in the way' },
      }),
    ).toThrow(/coverage TRANSFER/);
  });

  it('MUTATION: a skip without a reason is refused', () => {
    expect(() =>
      planProbes(['organization_member'], {
        organization_member: { coveredBy: 'somewhere' },
      }),
    ).toThrow(/naming why/);
  });

  it('MUTATION: an empty `coveredBy` does not satisfy the requirement', () => {
    expect(() =>
      planProbes(['organization_member'], {
        organization_member: { why: 'triggers', coveredBy: '' },
      }),
    ).toThrow();
  });

  it('a valid skip is recorded with its reason and its replacement coverage', () => {
    const { probe, skip } = planProbes(['organization', 'organization_member'], valid);
    expect(probe).toEqual(['organization']);
    expect(skip).toHaveLength(1);
    expect(skip[0]).toMatchObject({
      table: 'organization_member',
      coveredBy: expect.stringContaining('intent/003'),
    });
  });

  it('the real skip list names real test files', async () => {
    // Guards the class of rot where the tests a transfer points at are renamed or deleted.
    const { existsSync } = await import('node:fs');
    const src = (await import('node:fs')).readFileSync('scripts/check-policies.mjs', 'utf8');
    const referenced = [...src.matchAll(/supabase\/tests\/[^\s'"()]+\.sql/g)].map((m) => m[0]);
    expect(referenced.length).toBeGreaterThan(0);
    for (const path of referenced)
      expect(existsSync(path), `${path} is referenced but missing`).toBe(true);
  });
});

describe('reconcileEmitted — the check whose absence hid a one-table proof', () => {
  const skip = [{ table: 'organization_member' }];
  const all = [
    '000-setup-tests-hooks_rlsautotest.sql',
    '010-rls-enabled_rlsautotest.sql',
    '101-rls-organization_rlsautotest.sql',
    '102-rls-organization_invitation_rlsautotest.sql',
    '103-rls-organization_member_rlsautotest.sql',
    '104-rls-project_rlsautotest.sql',
  ];
  const probe = ['organization', 'organization_invitation', 'project'];

  it('reports the tables whose suites are actually on disk', () => {
    const r = reconcileEmitted(all, probe, skip);
    expect(r.suites).toEqual(['organization', 'organization_invitation', 'project']);
    expect(r.missing).toEqual([]);
    expect(r.remove).toEqual(['103-rls-organization_member_rlsautotest.sql']);
  });

  it('THE REGRESSION: a run that emitted only the last table is caught', () => {
    // Verbatim what the per-table loop produced — each invocation reconciled away the previous
    // one's file, so `project` was the only survivor while the gate printed three names.
    const r = reconcileEmitted(
      ['000-setup-tests-hooks_rlsautotest.sql', '104-rls-project_rlsautotest.sql'],
      probe,
      [],
    );
    expect(r.missing).toEqual(['organization', 'organization_invitation']);
  });

  it('does not count the RLS-on guard as a table', () => {
    // `010-rls-enabled` made three probed tables report as four, which equalled the table count.
    const r = reconcileEmitted(all, probe, skip);
    expect(r.suites).not.toContain('enabled');
  });

  it('a not-probeable entry that matches nothing is reported, not silently honoured', () => {
    const r = reconcileEmitted(all, probe, [{ table: 'organizaton_member' }]);
    expect(r.unmatchedSkips).toEqual(['organizaton_member']);
  });

  it('is not vacuous: given nothing, every planned table is missing', () => {
    expect(reconcileEmitted([], probe, []).missing).toEqual(probe);
  });
});
