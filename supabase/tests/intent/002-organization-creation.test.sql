-- SPEC-002 REQ-3 · intent layer for the one write path into `organization`.
-- Creation is a SECURITY DEFINER RPC precisely so there is no unconstrained INSERT policy; these
-- assert that the RPC cannot be turned into one.
begin;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test'),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test');

-- A second organization nobody in this test is a member of, so a POLICY refusal can be produced on
-- demand and compared against a PRIVILEGE refusal. Invisible to every assertion below, which all run
-- under RLS as a member of the first one.
insert into public.organization (id, name, slug)
  values ('bbbbbbbb-0000-0000-0000-00000000000b','Org B','org-b');

-- The claim, stated directly, because the behavioral assertion below cannot state it alone.
-- 20260908130000 revoked this grant after the RPC replaced the INSERT policy; `create_organization`
-- is SECURITY DEFINER and unaffected. Without this line the access matrix's dual-write-path row is
-- unfalsifiable from inside the repository: the tool's sentence is a static template that names
-- INSERT/UPDATE/DELETE whether or not they are held.
select ok(
  not has_table_privilege('authenticated', 'public.organization', 'INSERT'),
  'CREATE: `authenticated` holds NO INSERT privilege on organization -- the RPC is the only writer');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select isnt(public.create_organization('Acme Coffee','acme-coffee'), null,
  'CREATE: an authenticated user can create an organization');
select is((select role::text from public.organization_member
           where user_id = '11111111-1111-1111-1111-111111111111'), 'owner',
  'CREATE: the creator becomes owner in the same transaction -- never an org with no members');

-- The MESSAGE, not just the SQLSTATE. 42501 is returned both by "permission denied for table" and
-- by "new row violates row-level security policy", so an assertion on the code alone passes whether
-- the refusal comes from the grant layer or the policy layer -- and therefore cannot verify which
-- one is doing the work. That overlap was noted as a convenience when the grant was revoked; it is
-- what made the revoke's own verification unable to confirm what it claimed.
select throws_ok($$insert into public.organization (name,slug) values ('Sneaky','sneaky')$$,
  '42501', 'permission denied for table organization',
  'CREATE: the direct insert is refused at the GRANT layer -- named, not inferred from 42501');

-- The contrast that makes the assertion above discriminating rather than merely specific: the same
-- SQLSTATE, a different layer, a different message. If the INSERT grant were ever restored, the
-- test above would start seeing THIS message instead and fail.
select throws_ok(
  $$insert into public.organization_member (organization_id, user_id)
    values ('bbbbbbbb-0000-0000-0000-00000000000b','11111111-1111-1111-1111-111111111111')$$,
  '42501', 'new row violates row-level security policy for table "organization_member"',
  'CONTRAST: a POLICY refusal carries the same code and a different message');

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
