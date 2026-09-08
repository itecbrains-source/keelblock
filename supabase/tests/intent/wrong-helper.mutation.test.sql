-- SPEC-002 AC-4 · the load-bearing proof: the two policy layers are NOT redundant.
--
-- The whole reason this repository hand-writes adversarial pgTAP on top of a generated suite is the
-- claim that the generated layer cannot see a defect INSIDE a policy helper, because it mocks the
-- helper in order to test the wiring. That claim was reproduced once in a spike (F-1/F-2) and then
-- lived only in a research memo — so nothing in CI would have noticed if it stopped being true.
--
-- The defect planted here is deliberately SEMANTIC, not syntactic. `with check (true)` is already
-- caught by the generated layer as a footgun, so a syntactic defect would make this file pass for
-- the wrong reason and quietly retire the intent layer's justification.
--
-- SPEC-002's own instruction: if this ever starts passing trivially, the boundary has moved and the
-- spec should be re-argued rather than kept out of habit.

begin;
select plan(7);

-- ── fixture: two organizations, two owners ───────────────────────────────────
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

create temp table observed (label text primary key, rows int);
-- The observations are recorded while acting AS the tenant, so the tenant role must be able to
-- write them. It is a temp table in a transaction that ends in ROLLBACK; nothing survives.
grant all on observed to authenticated;

-- ── 1 · the helper as shipped ────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into observed values ('intent/correct', (select count(*)::int from public.organization_member));
reset role;

select is((select rows from observed where label = 'intent/correct'), 2,
  'SHIPPED: the owner of Org A sees their own two members, and no others');

-- ── 2 · plant the semantic defect: the helper forgets WHOSE membership it is ──
-- One clause removed. The function still compiles, still returns boolean, still reads the same
-- table, and every policy that delegates to it still delegates to it correctly.
create or replace function public.is_org_member(org uuid)
  returns boolean language sql stable security definer
  set search_path to 'public', 'pg_catalog'
as $$
  select exists (select 1 from public.organization_member m where m.organization_id = org);
$$;

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into observed values ('intent/defect', (select count(*)::int from public.organization_member));
select is((select count(*)::int from public.organization), 2,
  'DEFECT: the owner of Org A now sees every organization');
select is((select count(*)::int from public.project), 0,
  'DEFECT: projects follow the same helper — Org A has none, and neither tenant is hidden by row count alone');
reset role;

select is((select rows from observed where label = 'intent/defect'), 3,
  'DEFECT: the owner of Org A now sees every membership row in the database');

select isnt(
  (select rows from observed where label = 'intent/correct'),
  (select rows from observed where label = 'intent/defect'),
  'INTENT LAYER: the observation CHANGES when the helper is wrong — this is what catches it');

-- ── 3 · now the generated layer's technique, on the same defective schema ─────
-- It proves WIRING: it replaces the opaque policy function with a constant and checks that the
-- policy delegates to it. Its own assertion labels say so -- "[mocked; wiring]".
create or replace function public.is_org_member(org uuid)
  returns boolean language sql stable security definer
  set search_path to 'public', 'pg_catalog'
as $$ select true $$;

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into observed values ('mocked/over-defect', (select count(*)::int from public.organization_member));
reset role;

-- ── 4 · restore the correct helper, and mock it exactly the same way ──────────
create or replace function public.is_org_member(org uuid)
  returns boolean language sql stable security definer
  set search_path to 'public', 'pg_catalog'
as $$
  select exists (
    select 1 from public.organization_member m
    where m.organization_id = org and m.user_id = (select auth.uid())
  );
$$;
create or replace function public.is_org_member(org uuid)
  returns boolean language sql stable security definer
  set search_path to 'public', 'pg_catalog'
as $$ select true $$;

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into observed values ('mocked/over-correct', (select count(*)::int from public.organization_member));
reset role;

select is(
  (select rows from observed where label = 'mocked/over-defect'),
  (select rows from observed where label = 'mocked/over-correct'),
  'GENERATED LAYER: the observation is IDENTICAL whether the helper is right or wrong');

select is((select rows from observed where label = 'mocked/over-defect'), 3,
  'GENERATED LAYER: what it sees is "the policy delegates", which is true of both schemas');

select * from finish();
rollback;
