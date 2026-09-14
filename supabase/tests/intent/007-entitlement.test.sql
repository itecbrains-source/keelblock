-- SPEC-007 · the entitlement row and the map that reads it.
--
-- AC-1  (REQ-1) an organization's entitlement is readable by its members and by nobody else, and
--               revoking it changes the next read
-- AC-9  (REQ-7) the status-to-entitlement map is TOTAL over Stripe's eight documented statuses
-- AC-10 (REQ-7) active -> past_due stays entitled; only past_due -> unpaid revokes
--
-- The write half of this spec (webhook, idempotency, reconcile, portal) needs a Stripe account and
-- is not here. What is here is the thing those all write to, and it is the half that decides access.
begin;
select plan(22);

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a-owner@t'),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a-member@t'),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b-owner@t');

insert into public.organization (id, name, slug) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','Org A','org-a'),
  ('bbbbbbbb-0000-0000-0000-00000000000b','Org B','org-b');

insert into public.organization_member values
  ('aaaaaaaa-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111','owner',now()),
  ('aaaaaaaa-0000-0000-0000-00000000000a','22222222-2222-2222-2222-222222222222','member',now()),
  ('bbbbbbbb-0000-0000-0000-00000000000b','33333333-3333-3333-3333-333333333333','owner',now());

-- A is on a paid plan. B is not entitled at all -- and "not entitled" is the ABSENCE of a row here,
-- which is the case a test is most likely to skip and the one a new organization is actually in.
insert into public.organization_entitlement (organization_id, status, stripe_customer_id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','active','cus_A');

-- ── AC-9 · the map is total over the eight, and the eight are Stripe's ──────
-- Asserted against the ENUM rather than a list typed here: a suite that spells the statuses out
-- again agrees with itself, not with the schema. If a ninth is ever added to the type, the count
-- changes and this fails -- which is the point.
select is(
  (select count(*)::int from unnest(enum_range(null::public.subscription_status))),
  8,
  'AC-9: Stripe documents eight subscription statuses and the enum carries exactly those');

select is(
  (select count(*)::int from unnest(enum_range(null::public.subscription_status)) s
    where public.status_entitles(s) is null),
  0,
  'AC-9: every status maps to a decision -- none returns NULL');

select ok(public.status_entitles('trialing'),  'AC-9: trialing entitles -- Stripe: "you can safely provision your product"');
select ok(public.status_entitles('active'),    'AC-9: active entitles');
select ok(public.status_entitles('past_due'),  'AC-9: past_due entitles -- it IS the grace period, inside Stripe retries');
select ok(not public.status_entitles('unpaid'),             'AC-9: unpaid does not -- retries are exhausted');
select ok(not public.status_entitles('canceled'),           'AC-9: canceled does not');
select ok(not public.status_entitles('incomplete'),         'AC-9: incomplete does not');
select ok(not public.status_entitles('incomplete_expired'), 'AC-9: incomplete_expired does not');
select ok(not public.status_entitles('paused'),             'AC-9: paused does not');

-- ── AC-10 · the DIRECTION of the decision, asserted rather than left to handler order ──
select ok(
  public.status_entitles('active') and public.status_entitles('past_due'),
  'AC-10: active -> past_due stays entitled; a late payment is not a lockout');
select ok(
  public.status_entitles('past_due') and not public.status_entitles('unpaid'),
  'AC-10: only past_due -> unpaid revokes, which is where Stripe says to revoke');

-- ── AC-1 · isolation, as a MEMBER of A ──────────────────────────────────────
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select is(
  (select count(*)::int from public.organization_entitlement),
  1,
  'AC-1: a member reads their own organization''s entitlement');

select is(
  (select count(*)::int from public.organization_entitlement
    where organization_id = 'bbbbbbbb-0000-0000-0000-00000000000b'),
  0,
  'AC-1: and nothing of another organization''s -- the row that matters');

select ok(public.is_org_entitled('aaaaaaaa-0000-0000-0000-00000000000a'),
  'AC-1: the caller-facing question answers true for their own entitled organization');

-- The cross-tenant read through the FUNCTION, not just the table. A definer function is the one
-- thing that can answer about a row its caller cannot see, so it is asked directly.
select ok(not public.is_org_entitled('bbbbbbbb-0000-0000-0000-00000000000b'),
  'AC-1: and false for an organization they are not a member of, through the definer function');

-- ── AC-1 · an organization cannot grant itself a plan ───────────────────────
-- The thesis, as a test. ADR-006: Stripe bills, the database entitles. These fail on the GRANT,
-- before any policy is consulted -- there is no write grant at all, which is stronger than a policy
-- that says no.
select throws_ok(
  $$insert into public.organization_entitlement (organization_id, status)
    values ('bbbbbbbb-0000-0000-0000-00000000000b','active')$$,
  '42501', null,
  'AC-1: a member cannot INSERT an entitlement -- an org that writes this row grants itself a plan');

select throws_ok(
  $$update public.organization_entitlement set status = 'active'$$,
  '42501', null,
  'AC-1: nor UPDATE one');

select throws_ok(
  $$delete from public.organization_entitlement$$,
  '42501', null,
  'AC-1: nor DELETE one');

-- ── AC-1 · revoking changes the NEXT read, not the next token ───────────────
-- REQ-1's whole argument: entitlement is a row read per request, so a cancellation takes effect on
-- the next request rather than at token expiry. The same session, the same claim, a different answer.
reset role;
update public.organization_entitlement set status = 'canceled'
  where organization_id = 'aaaaaaaa-0000-0000-0000-00000000000a';

set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select ok(not public.is_org_entitled('aaaaaaaa-0000-0000-0000-00000000000a'),
  'AC-1: revoking changes the next read -- same session, same token, no longer entitled');

select is(
  (select count(*)::int from public.organization_entitlement),
  1,
  'AC-1: and the row is still READABLE while unentitled -- a cancelled org can see its own status');

-- ── the absent row ──────────────────────────────────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

select ok(not public.is_org_entitled('bbbbbbbb-0000-0000-0000-00000000000b'),
  'a new organization with no entitlement row is not entitled -- absence needs no branch');

select * from finish();
rollback;
