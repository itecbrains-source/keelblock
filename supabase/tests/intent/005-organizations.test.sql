-- SPEC-005 · intent layer for organizations and roles.
--
-- The claim this spec makes visible is that the ACTIVE ORGANIZATION IS NOT A BOUNDARY. A user in two
-- organizations picks which one they are looking at; the policy decides what they may see either
-- way. These assert that at the layer that actually refuses, so the surface can be wrong without
-- becoming a leak.
begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email) values
  ('a1111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','both@t'),
  ('a2222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','other@t'),
  ('a3333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','solo@t');

insert into public.organization (id, name, slug) values
  ('b1111111-0000-0000-0000-00000000000a','Org One','spec5-one'),
  ('b2222222-0000-0000-0000-00000000000b','Org Two','spec5-two'),
  ('b3333333-0000-0000-0000-00000000000c','Org Three','spec5-three');

-- `both@t` belongs to One and Two. `solo@t` belongs only to Three.
insert into public.organization_member values
  ('b1111111-0000-0000-0000-00000000000a','a1111111-1111-1111-1111-111111111111','owner',now()),
  ('b2222222-0000-0000-0000-00000000000b','a1111111-1111-1111-1111-111111111111','member',now()),
  ('b2222222-0000-0000-0000-00000000000b','a2222222-2222-2222-2222-222222222222','owner',now()),
  ('b3333333-0000-0000-0000-00000000000c','a3333333-3333-3333-3333-333333333333','owner',now());

insert into public.project (id, organization_id, name) values
  ('c1111111-0000-0000-0000-00000000000a','b1111111-0000-0000-0000-00000000000a','One project'),
  ('c2222222-0000-0000-0000-00000000000b','b2222222-0000-0000-0000-00000000000b','Two project'),
  ('c3333333-0000-0000-0000-00000000000c','b3333333-0000-0000-0000-00000000000c','Three project');

-- ── REQ-1 · a member of two organizations, switching between them ────────────
set local role authenticated;
set local request.jwt.claim.sub = 'a1111111-1111-1111-1111-111111111111';

-- Filtering to ONE is the application's view selection. It narrows; it never widens.
select results_eq(
  $$select name from public.project where organization_id = 'b1111111-0000-0000-0000-00000000000a'$$,
  array['One project'],
  'ACTIVE=One: the filter selects a view');

select results_eq(
  $$select name from public.project where organization_id = 'b2222222-0000-0000-0000-00000000000b'$$,
  array['Two project'],
  'ACTIVE=Two: switching changes the rows without changing the policy');

-- And with NO filter at all -- the case where the application forgot -- the caller sees their own
-- two organizations and NOT the third. A missing filter is a correctness bug, never a leak.
select results_eq(
  $$select count(*)::int from public.project$$,
  array[2],
  'NO FILTER: a forgotten filter shows too many of YOUR OWN rows, and none of anybody else''s');

-- ── REQ-1 · the switcher cannot widen access ────────────────────────────────
-- The exact attack the design makes pointless: name an organization you do not belong to.
select is_empty(
  $$select name from public.project where organization_id = 'b3333333-0000-0000-0000-00000000000c'$$,
  'FORGED ACTIVE ORG: naming an organization you do not belong to yields nothing');

select is_empty(
  $$select name from public.organization where id = 'b3333333-0000-0000-0000-00000000000c'$$,
  'FORGED ACTIVE ORG: its name is not readable either -- not even to render a header');

-- ── REQ-6 · administering members ───────────────────────────────────────────
-- `both@t` is a plain member of Org Two. A member may not administer.
select lives_ok(
  $$update public.organization_member set role = 'admin'
     where organization_id = 'b2222222-0000-0000-0000-00000000000b'
       and user_id = 'a2222222-2222-2222-2222-222222222222'$$,
  'MEMBER: the update is not an error -- RLS filters rather than raises');

-- ...and changed nothing, which is why the surface must report a zero-row write as a refusal
-- rather than as success (REQ-6).
select results_eq(
  $$select role::text from public.organization_member
     where organization_id = 'b2222222-0000-0000-0000-00000000000b'
       and user_id = 'a2222222-2222-2222-2222-222222222222'$$,
  array['owner'],
  'MEMBER: and it changed nothing -- a zero-row update is a refusal wearing a success');

-- ── REQ-2 · no organization or role claim is consulted anywhere ─────────────
-- The design refuses JWT claims for authorization because a token is a photograph taken up to
-- jwt_expiry ago. This asserts no policy has quietly started reading one.
select is_empty(
  $$select polname from pg_policy p
      join pg_class c on c.oid = p.polrelid
     where c.relname in ('organization','organization_member','project')
       and (pg_get_expr(p.polqual, p.polrelid) like '%jwt%'
         or pg_get_expr(p.polwithcheck, p.polrelid) like '%jwt%')$$,
  'REQ-2: no policy reads a claim from the JWT -- revocation must be immediate');

-- ── REQ-3 · creation has one path ───────────────────────────────────────────
select throws_ok(
  $$insert into public.organization (name, slug) values ('Direct','spec5-direct')$$,
  '42501', null,
  'REQ-3: a direct INSERT is refused -- creation goes through the RPC that grants ownership');

select * from finish();
rollback;
