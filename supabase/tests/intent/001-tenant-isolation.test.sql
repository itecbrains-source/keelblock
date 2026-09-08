-- SPEC-002 REQ-3 · the INTENT layer.
-- Hand-written, adversarial, small. This is the ONLY layer that tests what is inside
-- is_org_member() -- the generated suite mocks it (measured: research/03-SPIKE-RESULTS.md F-1,
-- where a helper that dropped its user_id check produced a total cross-tenant leak the generated
-- suite reported as clean).

begin;
select plan(13);

-- ── fixture: two organizations, three users ──────────────────────────────────
insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-a@test'),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-b@test'),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','member-a@test');

insert into public.organization (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','Org A','org-a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b','Org B','org-b');

insert into public.organization_member (organization_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111','owner'),
  ('aaaaaaaa-0000-0000-0000-00000000000a','33333333-3333-3333-3333-333333333333','member'),
  ('bbbbbbbb-0000-0000-0000-00000000000b','22222222-2222-2222-2222-222222222222','owner');

insert into public.project (organization_id, name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','A project'),
  ('bbbbbbbb-0000-0000-0000-00000000000b','B project');

-- ── as the owner of Org A ────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select is((select count(*)::int from public.project), 1,
  'READ: a member sees only their own organization''s projects');
select is((select count(*)::int from public.organization), 1,
  'READ: a member sees only their own organization');
select is((select count(*)::int from public.organization_member), 2,
  'READ: a member sees co-members of their own organization, and no others');

-- The defect that a read-based suite structurally cannot catch (spike F-3): the smuggled row is
-- invisible to its own writer, so this must be asserted as a rejection, not as an absent read.
select throws_ok(
  $$insert into public.project (organization_id, name)
    values ('bbbbbbbb-0000-0000-0000-00000000000b','SMUGGLED')$$,
  '42501', null,
  'WRITE: a cross-tenant INSERT is rejected -- asserted as the writer, not inferred from a read');

select throws_ok(
  $$update public.project set organization_id = 'bbbbbbbb-0000-0000-0000-00000000000b'$$,
  '42501', null,
  'WRITE: a member cannot move a row into another organization');

select is((select count(*)::int from public.organization_member
           where organization_id = 'bbbbbbbb-0000-0000-0000-00000000000b'), 0,
  'READ: the membership table itself is tenant-isolated (it is the keys to every other table)');

-- ── as a plain member of Org A: role boundaries ──────────────────────────────
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

select is(public.org_role_of('aaaaaaaa-0000-0000-0000-00000000000a')::text, 'member',
  'ROLE: the role helper reports the caller''s own role');

select throws_ok(
  $$insert into public.organization_member (organization_id, user_id, role)
    values ('aaaaaaaa-0000-0000-0000-00000000000a','22222222-2222-2222-2222-222222222222','member')$$,
  '42501', null,
  'ROLE: a plain member cannot add members');

-- MEASURED: a failing USING on UPDATE does NOT raise -- it matches zero rows and reports
-- `UPDATE 0`. So the privilege-escalation case must be asserted on the DATA, not on an exception.
-- A test that merely expected "no error" here would pass while proving nothing.
update public.organization_member set role = 'owner'
  where user_id = '33333333-3333-3333-3333-333333333333';
select is(
  (select role::text from public.organization_member
    where user_id = '33333333-3333-3333-3333-333333333333'
      and organization_id = 'aaaaaaaa-0000-0000-0000-00000000000a'),
  'member',
  'ROLE: a member cannot promote themselves -- the attempt is a silent no-op, the row is unchanged');

-- ── as anon ─────────────────────────────────────────────────────────────────
set local role anon;

-- MEASURED: anon is stopped by the GRANT layer, before RLS is ever consulted -- so the honest
-- assertion is a refusal, not an empty read. Asserting `count = 0` would also have passed, while
-- describing a mechanism that is not the one protecting the data.
select throws_ok(
  $$select count(*) from public.project$$, '42501', null,
  'ANON: tenant tables are refused at the grant layer, before RLS is consulted');

-- SPEC-001 REQ-11, measured in smoke S-4: EXECUTE defaults to PUBLIC, so before the revoke this
-- was an unauthenticated oracle over an RLS-protected table.
select throws_ok(
  $$select public.is_org_member('aaaaaaaa-0000-0000-0000-00000000000a')$$,
  '42501', null,
  'ANON: the membership helper is not callable -- EXECUTE is revoked from public and anon');

-- MEASURED, and the reason this test exists: on a clean stack `anon` COULD truncate these tables,
-- cascading across every tenant. RLS does not apply to TRUNCATE, so no policy and no policy test
-- would ever have seen it.
select throws_ok(
  $$truncate public.organization cascade$$, '42501', null,
  'ANON: cannot TRUNCATE -- the destructive default privilege is revoked');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select throws_ok(
  $$truncate public.project$$, '42501', null,
  'MEMBER: cannot TRUNCATE either -- RLS would not have covered it');

reset role;
select * from finish();
rollback;
