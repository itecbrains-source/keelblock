#!/usr/bin/env node
/**
 * What can a REAL plain member of the owning organization actually do?
 *
 * The generated prober cannot answer this. It mocks `is_org_member` and `is_org_admin` to constants,
 * which is what makes it exhaustive across identities without a fixture per role — and it is why its
 * "Authenticated · member" column reports what a MOCK admits rather than what a member can do
 * (F-54). For four commands those are different answers, and the matrix published the mock's.
 *
 * So: one real member, one real fixture, every policied command, inside a transaction that rolls
 * back. Small enough to be obvious, which matters more here than clever, because the artifact it
 * feeds is the one a stranger is invited to check us against.
 *
 * ONE resolver, exported: the matrix renders it and nothing else re-derives it. Two answers to this
 * question drifting apart is the recurring defect this repository keeps finding.
 */
import { execFileSync } from 'node:child_process';

const ORG = 'aaaaaaaa-0000-0000-0000-00000000000a';
const OWNER = '11111111-1111-1111-1111-111111111111';
const MEMBER = '33333333-3333-3333-3333-333333333333';
const PROJECT = 'cccccccc-0000-0000-0000-00000000000c';

/**
 * How to attempt each command as the member. A SELECT is "allowed" when it returns a row the member
 * should be able to see; a write when it affects one.
 *
 * Hand-written because there is no generic way to write a row to an arbitrary table, and deliberately
 * NOT a list of which tables exist — that comes from the catalog. A table the catalog has and this
 * map does not is an error, not a silent omission (`missingStatements`).
 */
export const PROBE_STATEMENTS = {
  'organization:SELECT': `select 1 from public.organization where id = '${ORG}'`,
  'organization:UPDATE': `update public.organization set name = 'probed' where id = '${ORG}'`,
  'organization:DELETE': `delete from public.organization where id = '${ORG}'`,
  'organization:INSERT': `insert into public.organization (name, slug) values ('probe','probe-slug')`,
  'organization_invitation:SELECT': `select 1 from public.organization_invitation where organization_id = '${ORG}'`,
  'organization_invitation:INSERT': `insert into public.organization_invitation (organization_id, email, role, token_hash, created_by, expires_at) values ('${ORG}','p@t','member','\\x03'::bytea,'${OWNER}', now() + interval '7 days')`,
  'organization_invitation:UPDATE': `update public.organization_invitation set email = 'p@t' where organization_id = '${ORG}'`,
  'organization_invitation:DELETE': `delete from public.organization_invitation where organization_id = '${ORG}'`,
  'organization_member:SELECT': `select 1 from public.organization_member where organization_id = '${ORG}'`,
  'organization_member:INSERT': `insert into public.organization_member (organization_id, user_id, role) values ('${ORG}','${OWNER}','member')`,
  'organization_member:UPDATE': `update public.organization_member set role = 'owner' where user_id = '${MEMBER}'`,
  'organization_member:DELETE': `delete from public.organization_member where organization_id = '${ORG}' and user_id = '${OWNER}'`,
  'project:SELECT': `select 1 from public.project where id = '${PROJECT}'`,
  'project:INSERT': `insert into public.project (organization_id, name) values ('${ORG}','probe')`,
  'project:UPDATE': `update public.project set name = 'probed' where id = '${PROJECT}'`,
  'project:DELETE': `delete from public.project where id = '${PROJECT}'`,
};

/**
 * Fail closed: a command the catalog has a policy for and this map cannot attempt is unmeasured, and
 * an unmeasured cell rendered as anything at all is a claim nobody made.
 * @param {string[]} keys @returns {string[]}
 */
export const missingStatements = (keys) => keys.filter((k) => !PROBE_STATEMENTS[k]).sort();

/** @param {string[]} keys @returns {string} */
export function buildProbeSql(keys) {
  const attempts = keys
    .filter((k) => PROBE_STATEMENTS[k])
    .sort()
    .map(
      (k) =>
        `insert into probe_result values ('${k}', pg_temp.attempt($probe$${PROBE_STATEMENTS[k]}$probe$));`,
    )
    .join('\n');
  return `
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('${OWNER}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','probe-owner@t'),
  ('${MEMBER}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','probe-member@t');
insert into public.organization (id, name, slug) values ('${ORG}','Probe Org','probe-org');
insert into public.organization_member (organization_id, user_id, role) values
  ('${ORG}','${OWNER}','owner'), ('${ORG}','${MEMBER}','member');
insert into public.project (id, organization_id, name) values ('${PROJECT}','${ORG}','Probe project');
insert into public.organization_invitation (organization_id, email, role, token_hash, created_by, expires_at)
  values ('${ORG}','invitee@t','member','\\x0102'::bytea,'${OWNER}', now() + interval '7 days');

create temp table probe_result(k text primary key, outcome text);
grant all on probe_result to authenticated;
-- Each attempt runs in its OWN subtransaction and is rolled back before the next one starts.
-- Measured the hard way: without this, the attempts contaminate each other in alphabetical order.
-- A project DELETE that SUCCEEDS destroys the row the later SELECT and UPDATE are measuring, so
-- weakening one policy made three cells move -- two of them to \`blocked but should be allowed\`,
-- an anomaly that was an artefact of the probe rather than anything the database did. A measurement
-- whose answer depends on the order it ran is not a measurement (F-28, F-29, in a third costume).
create function pg_temp.attempt(stmt text) returns text language plpgsql as $fn$
declare n int;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
    -- Raise to abandon the subtransaction, carrying the outcome out in the message. Returning
    -- normally would COMMIT the attempt into the fixture, which is the bug above.
    raise exception using errcode = 'P0001',
      message = case when n > 0 then 'probe:allowed' else 'probe:refused' end;
  exception
    when sqlstate 'P0001' then
      if sqlerrm like 'probe:%' then return substr(sqlerrm, 7); end if;
      return 'refused';
    when others then
      return 'refused';
  end;
end;
$fn$;

set local role authenticated;
set local request.jwt.claim.sub = '${MEMBER}';
${attempts}
\\echo '--probe--'
select k || '|' || outcome from probe_result order by k;
rollback;
`;
}

/**
 * @param {string} out raw psql output
 * @returns {Map<string, 'allowed'|'refused'>}
 */
export function parseProbeOutput(out) {
  const found = new Map();
  let started = false;
  for (const line of out.split('\n')) {
    if (line.trim() === '--probe--') {
      started = true;
      continue;
    }
    if (!started) continue;
    const [k, outcome] = line.trim().split('|');
    if (outcome === 'allowed' || outcome === 'refused') found.set(k, outcome);
  }
  return found;
}

/** @param {string} db @param {string[]} keys @returns {Map<string, 'allowed'|'refused'>} */
export function runMemberProbe(db, keys) {
  const missing = missingStatements(keys);
  if (missing.length) {
    throw new Error(
      `the member probe has no statement for ${missing.join(', ')}. A policied command nobody ` +
        `attempts is an unmeasured cell, and the matrix would publish a glyph for it anyway. ` +
        `Add the attempt to PROBE_STATEMENTS in scripts/member-probe.mjs.`,
    );
  }
  const out = execFileSync('psql', [db, '-tAq', '-v', 'ON_ERROR_STOP=0', '-f', '-'], {
    input: buildProbeSql(keys),
    encoding: 'utf8',
  });
  return parseProbeOutput(out);
}
