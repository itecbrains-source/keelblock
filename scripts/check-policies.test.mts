import { describe, expect, it } from 'vitest';
import {
  planProbes,
  reconcileEmitted,
  checkPositiveControls,
  classifyAuthority,
  checkAuthorityControls,
  parseMemberRefusedTags,
} from './check-policies.mjs';

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

describe('checkPositiveControls — AC-11, the general form of an empty fixture', () => {
  // The shape rlsautotest --report-json produces, reduced to what the rule reads.
  const table = (name: string, policied: string[], grid: Record<string, string[]>) => ({
    table: name,
    policied,
    idgrid: Object.fromEntries(
      policied.map((cmd) => [
        cmd,
        Object.fromEntries(
          ['authorized', 'other', 'anon', 'service_role'].map((id) => [
            id,
            { exp: (grid[cmd] ?? []).includes(id), pass: true },
          ]),
        ),
      ]),
    ),
  });

  const healthy = table('project', ['SELECT', 'INSERT', 'UPDATE', 'DELETE'], {
    SELECT: ['authorized'],
    INSERT: ['authorized'],
    UPDATE: ['authorized'],
    DELETE: ['authorized'],
  });

  it('a table whose every policied command proves someone CAN act is fine', () => {
    expect(checkPositiveControls({ tables: [healthy] }, {}, []).problems).toEqual([]);
  });

  it('THE REPLAY: assertions against a fixture nobody seeded', () => {
    // REQ-1b's own example, in the shape the report gives it: the toolkit's generated
    // `002-org-isolation.sql` ships its seed block commented out, so eight assertions run against
    // data that does not exist. Every one of them expects to see nothing, and every one passes.
    const empty = table('org_isolation', ['SELECT', 'INSERT', 'UPDATE', 'DELETE'], {});
    const { problems } = checkPositiveControls({ tables: [empty] }, {}, []);
    expect(problems).toHaveLength(4);
    expect(problems[0]).toContain('org_isolation:SELECT');
    expect(problems[0]).toMatch(/empty fixture|nothing was seeded|no identity is expected/i);
  });

  it('a command with NO policy is not a hole — nothing should succeed, so nothing is missing', () => {
    // organization_invitation deliberately has one SELECT policy and no write policy or grant.
    // UPDATE and DELETE are refused to everyone by design; demanding a positive control there
    // would be demanding proof that a door we welded shut can be opened.
    const invitation = table('organization_invitation', ['SELECT'], { SELECT: ['authorized'] });
    invitation.idgrid.UPDATE = { authorized: { exp: false, pass: true } };
    expect(checkPositiveControls({ tables: [invitation] }, {}, []).problems).toEqual([]);
  });

  it('honours the coverage transfers the gate already keeps, rather than a second list', () => {
    const member = table('organization_member', ['SELECT', 'UPDATE'], { SELECT: ['authorized'] });
    const notProbeable = { organization_member: { why: 'triggers', coveredBy: 'intent/003' } };
    expect(checkPositiveControls({ tables: [member] }, notProbeable, []).problems).toEqual([]);

    const org = table('organization', ['SELECT', 'DELETE'], { SELECT: ['authorized'] });
    expect(checkPositiveControls({ tables: [org] }, {}, ['organization:DELETE']).problems).toEqual(
      [],
    );
  });

  it('an exception that excuses nothing is reported — F-41, in a second costume', () => {
    // A stale entry silently widens into a coverage hole the moment the cell it named goes away.
    const { problems } = checkPositiveControls({ tables: [healthy] }, {}, ['project:TRUNCATE']);
    expect(problems.join(' ')).toContain('project:TRUNCATE');
  });

  it('is not vacuous: with the exceptions emptied, the real known cells are reported', () => {
    const org = table('organization', ['SELECT', 'DELETE'], { SELECT: ['authorized'] });
    const member = table('organization_member', ['SELECT', 'UPDATE'], { SELECT: ['authorized'] });
    const { problems } = checkPositiveControls({ tables: [org, member] }, {}, []);
    expect(problems.join(' ')).toContain('organization:DELETE');
    expect(problems.join(' ')).toContain('organization_member:UPDATE');
  });
});

describe('checkAuthorityControls — F-53, the class rather than the instance', () => {
  // The trial's defect was a correct tenant scope with the WRONG AUTHORITY: a policy asking
  // "is this caller a member" where it should ask "is this caller an admin". The schema guard
  // cannot see it (both expressions name the tenant key) and the generated prober cannot see it
  // (it mocks both helpers to the same constant). Only the intent layer can, and only if somebody
  // remembered to write the assertion. This is the rule that stops it being remembered.

  const rows = (...r: Array<[string, string, string, string | null]>) =>
    r.map(([table, cmd, policy, fn]) => ({ table, cmd, policy, fn, permissive: true }));

  it('a policy calling is_org_admin requires a member to be refused', () => {
    const req = classifyAuthority(rows(['project', 'DELETE', 'project_delete', 'is_org_admin']));
    expect(req.get('project:DELETE')?.authority).toBe('above-member');
  });

  it('a policy calling only is_org_member requires nothing — a member is meant to succeed', () => {
    const req = classifyAuthority(rows(['project', 'SELECT', 'project_select', 'is_org_member']));
    expect(req.get('project:SELECT')?.authority).toBe('member');
  });

  it('an owner comparison is above member too, though it names no is_org_ helper', () => {
    const req = classifyAuthority(
      rows(['organization', 'DELETE', 'organization_delete', 'org_role_of']),
    );
    expect(req.get('organization:DELETE')?.authority).toBe('above-member');
  });

  it('a policy calling NO helper is unclassified, and unclassified fails', () => {
    // Fail closed. A policy the rule cannot read is not a policy the rule may wave through — that
    // is F-41 and F-48, where a check was satisfied by the absence of the thing it looked for.
    const req = classifyAuthority(rows(['thing', 'SELECT', 'thing_select', null]));
    expect(req.get('thing:SELECT')?.authority).toBe('unclassified');
    const { problems } = checkAuthorityControls(req, new Set());
    expect(problems.join(' ')).toMatch(/thing:SELECT/);
  });

  it('permissive policies are OR-ed, so the WEAKEST one decides what a member can do', () => {
    const req = classifyAuthority(
      rows(
        ['project', 'DELETE', 'strict', 'is_org_admin'],
        ['project', 'DELETE', 'lax', 'is_org_member'],
      ),
    );
    expect(req.get('project:DELETE')?.authority).toBe('member');
  });

  it('MUTATION: an above-member command with no member-refused control is named', () => {
    const req = classifyAuthority(rows(['project', 'DELETE', 'project_delete', 'is_org_admin']));
    const { problems } = checkAuthorityControls(req, new Set());
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('project:DELETE');
  });

  it('the same command with the control present is fine', () => {
    const req = classifyAuthority(rows(['project', 'DELETE', 'project_delete', 'is_org_admin']));
    const { problems, required } = checkAuthorityControls(req, new Set(['project:DELETE']));
    expect(problems).toEqual([]);
    expect(required).toBe(1);
  });

  it('a control claiming a refusal a MEMBER-level command cannot produce is reported', () => {
    // The consistency half. If project:DELETE is downgraded to is_org_member and its assertion
    // still passes, the assertion is not asserting what its name says.
    const req = classifyAuthority(rows(['project', 'DELETE', 'project_delete', 'is_org_member']));
    const { problems } = checkAuthorityControls(req, new Set(['project:DELETE']));
    expect(problems.join(' ')).toMatch(/project:DELETE/);
  });

  it('a control for a command that has no policy at all is reported', () => {
    const { problems } = checkAuthorityControls(new Map(), new Set(['ghost:UPDATE']));
    expect(problems.join(' ')).toMatch(/ghost:UPDATE/);
  });

  it('is not vacuous: with no commands and no controls there is nothing to report', () => {
    const { problems, required } = checkAuthorityControls(new Map(), new Set());
    expect(problems).toEqual([]);
    expect(required).toBe(0);
  });
});

describe('parseMemberRefusedTags — read the run, not the source', () => {
  // TAP is an output format, and the tags are collected from a run that actually happened. Reading
  // the .sql files instead would count an assertion that is commented out.
  it('collects a tag from a passing assertion', () => {
    const tap = 'ok 10 - ROLE: a member cannot delete [member-refused project:DELETE]';
    expect([...parseMemberRefusedTags(tap)]).toEqual(['project:DELETE']);
  });

  it('IGNORES a failing assertion — a red test proves nothing and covers nothing', () => {
    const tap = 'not ok 10 - ROLE: a member cannot delete [member-refused project:DELETE]';
    expect([...parseMemberRefusedTags(tap)]).toEqual([]);
  });

  it('does not mistake a TAP directive for coverage, whatever it spells', () => {
    const tap = 'ok 10 - a member cannot delete [member-refused project:DELETE] # SKIP not yet';
    const todoish = 'ok 11 - a member cannot delete [member-refused project:DELETE] # nope';
    expect([...parseMemberRefusedTags(todoish)]).toEqual([]);
    expect([...parseMemberRefusedTags(tap)]).toEqual([]);
  });

  it('collects several, across lines', () => {
    const tap = [
      '1..3',
      'ok 1 - one [member-refused organization:UPDATE]',
      'ok 2 - untagged assertion',
      'ok 3 - three [member-refused organization_member:DELETE]',
    ].join('\n');
    expect([...parseMemberRefusedTags(tap)].sort()).toEqual([
      'organization:UPDATE',
      'organization_member:DELETE',
    ]);
  });
});

describe('parseMemberRefusedTags — a wrapped description', () => {
  // How the first four controls were written and lost: pgTAP emits a description containing a
  // newline as an `ok` line plus `#` continuations, and the tag was on the continuation.
  it('reads a tag off a continuation line, because it belongs to the assertion above it', () => {
    const tap = [
      'ok 13 - a member cannot remove anybody',
      '#    [member-refused org_member:DELETE]',
    ].join('\n');
    expect([...parseMemberRefusedTags(tap)]).toEqual(['org_member:DELETE']);
  });

  it('a FAILING assertion does not get to claim its continuations either', () => {
    const tap = [
      'not ok 13 - a member cannot remove anybody',
      '#  [member-refused org_member:DELETE]',
    ].join('\n');
    expect([...parseMemberRefusedTags(tap)]).toEqual([]);
  });

  it('a continuation after a plain line is not attributed to an earlier assertion', () => {
    const tap = ['ok 1 - fine', '1..1', '#  [member-refused ghost:DELETE]'].join('\n');
    expect([...parseMemberRefusedTags(tap)]).toEqual([]);
  });
});
