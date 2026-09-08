-- SPEC-002 REQ-3 · intent layer for the role model.
-- These were written AFTER an audit found both defects live. They are the cases the first intent
-- suite did not think of, which is the honest argument for auditing a suite you wrote yourself.
begin;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@t'),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','admin@t'),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','member@t');
insert into public.organization (id, name, slug) values ('aaaaaaaa-0000-0000-0000-00000000000a','Org A','org-a');
insert into public.organization_member values
  ('aaaaaaaa-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111','owner',now()),
  ('aaaaaaaa-0000-0000-0000-00000000000a','22222222-2222-2222-2222-222222222222','admin',now()),
  ('aaaaaaaa-0000-0000-0000-00000000000a','33333333-3333-3333-3333-333333333333','member',now());

-- ── as the ADMIN ────────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

-- DEFECT 1, measured before the fix: `UPDATE 1`, owner -> member. An admin could seize the org.
select throws_ok(
  $$update public.organization_member set role = 'member'
     where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'P0001', null,
  'OWNER: an admin cannot demote the owner -- the role would be meaningless otherwise');

select throws_ok(
  $$delete from public.organization_member
     where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'P0001', null, 'OWNER: an admin cannot remove the owner');

select throws_ok(
  $$update public.organization_member set role = 'owner'
     where user_id = '22222222-2222-2222-2222-222222222222'$$,
  'P0001', null, 'OWNER: an admin cannot promote themselves to owner');

select is((select role::text from public.organization_member
           where user_id = '11111111-1111-1111-1111-111111111111'), 'owner',
  'OWNER: after all three attempts the owner is unchanged');

-- an admin retains legitimate authority over non-owners
select lives_ok(
  $$update public.organization_member set role = 'admin'
     where user_id = '33333333-3333-3333-3333-333333333333'$$,
  'ADMIN: can still manage non-owner members -- the fix did not over-tighten');

-- ── as the OWNER ────────────────────────────────────────────────────────────
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- DEFECT 2, measured before the fix: orgs=1, members=0 -- an organization nobody can administer,
-- nobody can delete (delete requires owner), holding its slug forever.
select throws_ok(
  $$delete from public.organization_member
     where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'P0001', null,
  'LAST OWNER: cannot leave -- that would orphan the organization');

select throws_ok(
  $$update public.organization_member set role = 'member'
     where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'P0001', null, 'LAST OWNER: cannot demote themselves either -- same orphan by another route');

-- ...but succession works: promote another owner first, then leave.
select lives_ok(
  $$ update public.organization_member set role = 'owner'
       where user_id = '22222222-2222-2222-2222-222222222222';
     delete from public.organization_member
       where user_id = '11111111-1111-1111-1111-111111111111'; $$,
  'SUCCESSION: an owner may leave once another owner exists');

-- ── the helpers answer the same question the same way ───────────────────────
-- `is_org_admin` returned NULL for a non-member (measured 2026-09-08) while its sibling
-- `is_org_member` returned false. In a policy USING clause NULL reads as a refusal, so no isolation
-- test could see it, and the generated prober mocks these helpers to true/false so by construction
-- it never observes the real return. It surfaces only in procedural code -- `if not NULL then` does
-- not branch -- which is why the third assertion below is the one that matters: it reproduces the
-- exact shape SPEC-006's `invite_member` uses, and it fails against the pre-fix function.
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

select is(public.is_org_member('00000000-0000-0000-0000-0000000000ff'), false,
  'HELPERS: is_org_member answers false for an organization the caller has no membership in');

select is(public.is_org_admin('00000000-0000-0000-0000-0000000000ff'), false,
  'HELPERS: is_org_admin answers false too -- NULL here is not false, it is the absence of an answer');

create or replace function pg_temp.guard_shape(org uuid) returns text language plpgsql as $$
begin
  if not public.is_org_admin(org) then
    return 'refused';
  end if;
  return 'allowed';
end;
$$;
select is(pg_temp.guard_shape('00000000-0000-0000-0000-0000000000ff'), 'refused',
  'HELPERS: `if not is_org_admin(...)` REFUSES -- the guard shape every definer function uses, and '
  'the one a NULL return falls straight through');

reset role;
select * from finish();
rollback;
