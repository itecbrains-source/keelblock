-- SPEC-007 · the entitlement row and the map that reads it.
--
-- AC-1  (REQ-1) an organization's entitlement is readable by its members and by nobody else, and
--               revoking it changes the next read
-- AC-9  (REQ-7) the status-to-entitlement map is TOTAL over Stripe's eight documented statuses
-- AC-10 (REQ-7) active -> past_due stays entitled; only past_due -> unpaid revokes
-- AC-8  (REQ-1) an unentitled organization is refused a paid surface and granted it when the row
--               changes -- and the three commands the gate does NOT cover stay permitted
--
-- The write half of this spec (webhook, idempotency, reconcile, portal) needs a Stripe account and
-- is not here. What is here is the thing those all write to, and it is the half that decides access.
begin;
select plan(47);

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

-- ── AC-8 · while ENTITLED, a member may create a project ────────────────────
-- The positive half first, and while org A is still `active`. This row is then carried across the
-- revocation below, which is what makes "keep what you have" a demonstration rather than a claim.
select lives_ok(
  $$insert into public.project (id, organization_id, name)
    values ('cccccccc-0000-0000-0000-00000000000c','aaaaaaaa-0000-0000-0000-00000000000a','Paid Project')$$,
  'AC-8: an entitled organization''s member may create a project');

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

-- ── AC-8 · the gate, and the three commands it deliberately does NOT gate ───
-- Same session, same member, same project row. Only the entitlement changed.
select throws_ok(
  $$insert into public.project (organization_id, name)
    values ('aaaaaaaa-0000-0000-0000-00000000000a','After The Lapse')$$,
  '42501', null,
  'AC-8: an UNENTITLED organization cannot create a project -- refused by the policy, not by the UI');

-- **The positive controls, and they are the reason "INSERT only" is a property rather than a
-- sentence in a migration comment.** A gate asserted only by what it refuses can be widened to
-- SELECT by anyone who thinks it reads better that way, and nothing goes red. These three make the
-- narrowness load-bearing: the next person to add a command to that clause meets a failing test.
select is(
  (select count(*)::int from public.project
    where id = 'cccccccc-0000-0000-0000-00000000000c'),
  1,
  'AC-8: an unentitled organization can still SELECT the projects it already has -- data does not vanish with a subscription');

select lives_ok(
  $$update public.project set name = 'Renamed While Unentitled'
    where id = 'cccccccc-0000-0000-0000-00000000000c'$$,
  'AC-8: and still UPDATE them -- a lapse does not freeze work they already own');

-- DELETE as the OWNER, because `project_delete` is gated on `is_org_admin` by SPEC-005 and a plain
-- member is refused it whatever the entitlement says. Asserting it as the member would pass for the
-- wrong reason and would read as evidence that entitlement blocks deletes.
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select lives_ok(
  $$delete from public.project where id = 'cccccccc-0000-0000-0000-00000000000c'$$,
  'AC-8: and an admin can still DELETE them -- a lapsed organization can clean up after itself');

-- ── the absent row ──────────────────────────────────────────────────────────
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

select ok(not public.is_org_entitled('bbbbbbbb-0000-0000-0000-00000000000b'),
  'a new organization with no entitlement row is not entitled -- absence needs no branch');

-- ── the event ledger (REQ-5, REQ-8) ─────────────────────────────────────────
-- `stripe_event` has RLS enabled and ZERO policies, so `rlsautotest` generates no suite for it --
-- correctly: there is no policy to probe. Its protection is a PRIVILEGE-layer fact, and the policy
-- gate refuses to report on a table it has no coverage for. These are the assertions that coverage
-- was transferred to, registered against the table in `check-policies.mjs`'s NOT_PROBEABLE.
--
-- The application never touches this table. Both app roles are asserted rather than one, because
-- "anon cannot" and "authenticated cannot" are different grants and only one of them was ever the
-- default.
reset role;
set local role anon;
select throws_ok($$select 1 from public.stripe_event$$, '42501', null,
  'LEDGER: anon cannot read the event ledger');
select throws_ok($$insert into public.stripe_event (id, type) values ('evt_x','x')$$, '42501', null,
  'LEDGER: anon cannot forge a processed event');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select throws_ok($$select 1 from public.stripe_event$$, '42501', null,
  'LEDGER: a signed-in member cannot read it either -- it is not tenant data');
select throws_ok($$insert into public.stripe_event (id, type) values ('evt_y','y')$$, '42501', null,
  'LEDGER: nor write it');

-- ── AC-6 · the billing write path, and who may reach it ────────────────────
-- SPEC-007 REQ-5/REQ-6. The webhook and the reconcile write through five SECURITY DEFINER functions
-- rather than through table grants, and `20260917140000` records why: MEASURED 2026-09-17, a
-- service_role table grant of ANY width makes it a probed identity on every tenant table and turns
-- five suites UNRELIABLE (F-81). Narrowness was not the variable; the mechanism was.
--
-- These functions are therefore the entire billing write path, so who can call them IS the boundary.
reset role;
set local role anon;

select throws_ok(
  $$select public.claim_stripe_event('evt_forged','customer.subscription.updated')$$,
  '42501', null,
  'AC-6: anon cannot claim an event -- an unauthenticated write into the billing ledger');
select throws_ok(
  $$select public.write_entitlement('aaaaaaaa-0000-0000-0000-00000000000a','active','cus_x','sub_x')$$,
  '42501', null,
  'AC-6: anon cannot write an entitlement -- this is the function that grants a plan');
select throws_ok(
  $$select * from public.entitlements_to_reconcile()$$,
  '42501', null,
  'AC-6: anon cannot list entitlements -- the one function here that returns ROWS');

-- The same three as a signed-in member. A different grant from anon's, and only one of them was ever
-- the default: Postgres grants EXECUTE on new functions to PUBLIC, so without the revokes in that
-- migration every one of these is reachable by everybody (smoke S-4).
reset role;
set local role authenticated;
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

select throws_ok(
  $$select public.claim_stripe_event('evt_forged','customer.subscription.updated')$$,
  '42501', null,
  'AC-6: a signed-in member cannot claim an event either');
select throws_ok(
  $$select public.write_entitlement('aaaaaaaa-0000-0000-0000-00000000000a','active','cus_x','sub_x')$$,
  '42501', null,
  'AC-6: nor write their own entitlement -- an organization that could is granting itself a plan');
select throws_ok(
  $$select * from public.entitlements_to_reconcile()$$,
  '42501', null,
  'AC-6: nor read every organization''s billing rows through the reconcile helper');

-- ── AC-6 · and service_role CAN, while still holding no table privilege ─────
reset role;
set local role service_role;

select ok(public.claim_stripe_event('evt_first','customer.subscription.updated'),
  'AC-6: service_role claims an event, and is told it is the first');
select ok(not public.claim_stripe_event('evt_first','customer.subscription.updated'),
  'AC-6: and a duplicate claim answers false -- idempotency is the primary key, not a check');

select lives_ok(
  $$select public.write_entitlement('bbbbbbbb-0000-0000-0000-00000000000b','active','cus_B','sub_B')$$,
  'AC-6: service_role writes an entitlement through the definer function');

select is(
  (select count(*)::int from public.entitlements_to_reconcile()),
  1,
  'AC-6: the reconcile sees the subscription it must ask Stripe about');

-- Read back as the OWNER, not as service_role, and the reason is the design itself: service_role
-- cannot SELECT this table -- it holds no privilege on it and never will. It wrote through a definer
-- function and cannot read what it wrote. That is not an inconvenience to work around; it is the
-- assertion below this one, demonstrated in passing.
reset role;
select is(
  (select status::text from public.organization_entitlement
    where organization_id = 'bbbbbbbb-0000-0000-0000-00000000000b'),
  'active',
  'AC-6: and the row it wrote is the row a policy will read -- one source, not two');

set local role service_role;
select throws_ok(
  $$select 1 from public.organization_entitlement$$,
  '42501', null,
  'AC-6: service_role cannot even READ the table it just wrote -- EXECUTE-only is the whole design');

-- **THE POSTURE, asserted rather than assumed.** This is the assertion that makes the whole design
-- checkable: the write path exists and works, and service_role STILL holds no privilege on any
-- tenant table. 20260908150000's rule is kept rather than spent, and if someone later adds a table
-- grant to make something easier, this goes red before the probe suites turn amber.
reset role;
select is(
  (select count(*)::int from information_schema.role_table_grants
    where grantee = 'service_role' and table_schema = 'public'),
  0,
  'AC-6: service_role holds NO table privilege in public -- the write path is EXECUTE-only (F-81)');

set local role service_role;

-- service_role holds NOTHING here either, today, and that is the posture rather than an oversight.
-- 20260908150000: "service_role holds NOTHING on tenant tables until something needs it." The
-- handler's dependencies are not wired yet, so nothing needs it, and a first draft of the ledger
-- migration granted it anyway -- which made rlsautotest probe service_role on every tenant table and
-- return five suites' worth of UNRELIABLE cells, because a BYPASSRLS role cannot demonstrate a
-- policy.
--
-- **UPDATED 2026-09-17, and the update is that they did NOT have to change.** These two were written
-- expecting to be rewritten on the day the handler was wired. The handler is wired (AC-6) and they
-- still pass, because the write path turned out to be five SECURITY DEFINER functions rather than a
-- table grant -- the grant was measured to poison five suites at ANY width, so the posture was kept
-- instead of spent (20260917140000). An assertion that survives the event it was written for is
-- better evidence than one that was edited to keep passing.
reset role;
set local role service_role;
select throws_ok($$select 1 from public.stripe_event$$, '42501', null,
  'LEDGER: service_role holds nothing here YET -- the grant lands with the handler that needs it');
select throws_ok($$insert into public.stripe_event (id, type) values ('evt_ok','x')$$, '42501', null,
  'LEDGER: including insert, so the ledger is unreachable by every role today');

-- F-80's subject at the privilege layer. Today this passes because service_role holds nothing at
-- all; when the wiring migration grants it the three verbs the handler runs, this assertion is what
-- distinguishes that from `grant all`, and it must keep passing.
select throws_ok($$truncate public.organization_entitlement$$, '42501', null,
  'LEDGER: and never TRUNCATE on a tenant table -- the privilege RLS cannot filter (F-80)');

reset role;

select * from finish();
rollback;
