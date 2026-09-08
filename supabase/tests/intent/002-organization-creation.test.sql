-- SPEC-002 REQ-3 · intent layer for the one write path into `organization`.
-- Creation is a SECURITY DEFINER RPC precisely so there is no unconstrained INSERT policy; these
-- assert that the RPC cannot be turned into one.
begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test'),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select isnt(public.create_organization('Acme Coffee','acme-coffee'), null,
  'CREATE: an authenticated user can create an organization');
select is((select role::text from public.organization_member
           where user_id = '11111111-1111-1111-1111-111111111111'), 'owner',
  'CREATE: the creator becomes owner in the same transaction -- never an org with no members');

select throws_ok($$insert into public.organization (name,slug) values ('Sneaky','sneaky')$$,
  '42501', null,
  'CREATE: there is no INSERT policy -- the RPC is the only way in');

select throws_ok($$select public.create_organization('Bad Slug','Not A Slug')$$,
  '22023', null, 'CREATE: the slug is validated');
select throws_ok($$select public.create_organization('   ','blank-name')$$,
  '22023', null, 'CREATE: a blank name is rejected');
select throws_ok($$select public.create_organization('Duplicate','acme-coffee')$$,
  '23505', null, 'CREATE: a taken slug is rejected with a usable error, not a constraint dump');

-- The generated suite reports DELETE on `organization` as UNRELIABLE: the policy compares
-- `org_role_of(id) = 'owner'` rather than delegating to a boolean, so mocking cannot isolate it, and
-- the tool says so instead of guessing. These two tests are that instruction carried out -- they are
-- the reason the intent layer exists.
select is((select count(*)::int from public.organization), 1, 'DELETE: fixture has one organization');

set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select lives_ok(
  $$delete from public.organization where slug = 'acme-coffee'$$,
  'DELETE: a non-member''s delete raises nothing -- RLS matches no rows (the silent no-op)');
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select is((select count(*)::int from public.organization where slug = 'acme-coffee'), 1,
  'DELETE: ...and the organization is still there -- asserted on the DATA, never on an exception');

-- The RPC runs as its owner and therefore bypasses RLS. If it were reachable unauthenticated it
-- would be a way to write rows with no session at all.
reset role;
set local role anon;
select throws_ok($$select public.create_organization('Anon Co','anon-co')$$,
  '42501', null, 'CREATE: not callable by anon -- EXECUTE is revoked');

reset role;
select * from finish();
rollback;
