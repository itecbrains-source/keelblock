-- SPEC-006 · intent layer for invitations.
--
-- The first row in this schema that must be readable by somebody who is not a member. Every policy
-- here still denies exactly that; the exception is ONE security-definer function with a stated
-- return shape, and these are the assertions that keep it narrow.
begin;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email) values
  ('d1111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','inviter@t'),
  ('d2222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','invitee@t'),
  ('d3333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','stranger@t');

insert into public.organization (id, name, slug) values
  ('e1111111-0000-0000-0000-00000000000a','Invitational','spec6-inv'),
  ('e2222222-0000-0000-0000-00000000000b','Elsewhere','spec6-else');
insert into public.organization_member values
  ('e1111111-0000-0000-0000-00000000000a','d1111111-1111-1111-1111-111111111111','owner',now()),
  ('e2222222-0000-0000-0000-00000000000b','d3333333-3333-3333-3333-333333333333','owner',now());

-- ── REQ-1 · an admin creates one; the token comes back exactly once ──────────
set local role authenticated;
set local request.jwt.claim.sub = 'd1111111-1111-1111-1111-111111111111';

select lives_ok(
  $$select public.invite_member('e1111111-0000-0000-0000-00000000000a', 'invitee@t', 'admin')$$,
  'REQ-1: an admin of the organization may invite');

create temporary table t as
  select public.invite_member('e1111111-0000-0000-0000-00000000000a','second@t','member') as token;

-- ── REQ-3 · the token is stored hashed, never in the clear ──────────────────
select is_empty(
  $$select 1 from public.organization_invitation i, t
     where i.token_hash::text = t.token$$,
  'REQ-3: the plaintext token appears in no row -- a leaked table is not a set of working invitations');

select isnt_empty(
  $$select 1 from public.organization_invitation i, t
     where i.token_hash = extensions.digest(t.token, 'sha256')$$,
  'REQ-3: the row holds sha256 of the token');

-- ── REQ-1 · a stranger reads nothing from the table itself ──────────────────
set local request.jwt.claim.sub = 'd3333333-3333-3333-3333-333333333333';

select is_empty(
  $$select 1 from public.organization_invitation$$,
  'REQ-1: an outsider SELECTs nothing -- the exception is not in a policy');

select throws_ok(
  $$insert into public.organization_invitation (organization_id, email, role, token_hash, expires_at)
     values ('e1111111-0000-0000-0000-00000000000a','me@t','owner',extensions.digest('x','sha256'), now() + interval '7 days')$$,
  '42501', null,
  'REQ-1: an outsider cannot forge an invitation into an organization they do not administer');

-- ── REQ-2 · the preview returns the name and role, and nothing else ─────────
select results_eq(
  $$select organization_name, invited_role::text from public.invitation_preview((select token from t))$$,
  $$values ('Invitational', 'member')$$,
  'REQ-2: a stranger with the token learns who invited them and as what');

-- information_schema.columns covers tables and views, NEVER composite types, so the first version
-- of this assertion returned zero rows for every possible schema -- it could not have passed after a
-- widening OR before one. A check with one reachable outcome proves nothing; the catalog is the
-- only place a composite type's attributes exist.
select bag_eq(
  $$select a.attname::text
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'invitation_preview_result'
       and c.relkind = 'c' and a.attnum > 0 and not a.attisdropped$$,
  $$values ('organization_name'), ('invited_role')$$,
  'REQ-2: the return shape IS the boundary -- adding a column to it is a widening, and fails here');

-- ── REQ-4 · an invented token is not found ──────────────────────────────────
select is_empty(
  $$select 1 from public.invitation_preview('not-a-real-token')$$,
  'REQ-4: an invented token is not found');

-- ── REQ-5 · acceptance binds to the caller and grants the invited role ──────
set local request.jwt.claim.sub = 'd2222222-2222-2222-2222-222222222222';

select lives_ok(
  $$select public.accept_invitation((select token from t))$$,
  'REQ-5: the invitee accepts');

select results_eq(
  $$select role::text from public.organization_member
     where organization_id = 'e1111111-0000-0000-0000-00000000000a'
       and user_id = 'd2222222-2222-2222-2222-222222222222'$$,
  array['member'],
  'REQ-5: they hold the role they were invited as, not one of their choosing');

-- ── REQ-4 · replay after acceptance is answered exactly like an invented one ─
select is_empty(
  $$select 1 from public.invitation_preview((select token from t))$$,
  'REQ-4: a spent token is not found -- not "already accepted", which confirms the guess was good');

select throws_ok(
  $$select public.accept_invitation((select token from t))$$,
  'P0001', null,
  'REQ-3: it cannot be redeemed twice');

-- ── REQ-7 · the invariants still hold on the new path ───────────────────────
set local request.jwt.claim.sub = 'd1111111-1111-1111-1111-111111111111';
select throws_ok(
  $$select public.invite_member('e2222222-0000-0000-0000-00000000000b','x@t','owner')$$,
  '42501', null,
  'REQ-7: an invitation cannot be minted into an organization the caller does not administer');

-- ── REQ-7 · ownership is not invitable ─────────────────────────────────────
-- Refused at MINT, not at acceptance. It used to be mintable and unacceptable -- the owner-authority
-- trigger fired inside accept_invitation and the invitee got "not found" forever -- and making
-- acceptance succeed would have handed an admin a token-shaped route to ownership.
select throws_ok(
  $$select public.invite_member('e1111111-0000-0000-0000-00000000000a','new-owner@t','owner')$$,
  '22023', null,
  'REQ-7: an owner invitation is refused where it is created, not where it is redeemed');

-- ── REQ-7 · the premise: an invitation is the ONLY way in ──────────────────
-- `accept_invitation` is a second definer writer of organization_member, which the access matrix
-- reports as a dual write path. That is only acceptable while the DIRECT path refuses a stranger --
-- if a person could insert their own membership row, every line of this spec would be decoration.
-- The stranger here administers a different organization, which is the strongest form: they hold
-- the admin role somewhere, and it buys them nothing here.
set local request.jwt.claim.sub = 'd3333333-3333-3333-3333-333333333333';
-- `member`, not `owner`: an `owner` row is refused by the SPEC-001 owner-authority TRIGGER before
-- the policy is ever consulted, which would prove the wrong thing. This is the policy refusing.
select throws_ok(
  $$insert into public.organization_member (organization_id, user_id, role)
    values ('e1111111-0000-0000-0000-00000000000a','d3333333-3333-3333-3333-333333333333','member')$$,
  '42501', null,
  'REQ-7: a stranger cannot write their own membership -- the invitation path is not optional');
set local request.jwt.claim.sub = 'd1111111-1111-1111-1111-111111111111';

-- ── REQ-1 · the address is checked where it is written ─────────────────────
-- The column carries no CHECK (see the migration for why), so this is the assertion that the rule
-- still exists. It runs against the only path that can write the row.
select throws_ok(
  $$select public.invite_member('e1111111-0000-0000-0000-00000000000a', 'x', 'member')$$,
  '22023', null,
  'REQ-1: a malformed address is refused on the single write path');

-- ── REQ-6 · revocation is immediate ────────────────────────────────────────
-- `plan(14)` against thirteen assertions is what surfaced this: REQ-6 had a function, a grant and a
-- comment, and no test. The count was the only thing that noticed.
create temporary table r as
  select public.invite_member('e1111111-0000-0000-0000-00000000000a','revoked@t','member') as token;

select isnt_empty(
  $$select 1 from public.invitation_preview((select token from r))$$,
  'REQ-6: it resolves BEFORE revocation -- without this the next assertion passes on a typo');

select lives_ok(
  $$select public.revoke_invitation(
      (select id from public.organization_invitation
        where token_hash = extensions.digest((select token from r), 'sha256')))$$,
  'REQ-6: an admin revokes it');

select is_empty(
  $$select 1 from public.invitation_preview((select token from r))$$,
  'REQ-6: a revoked token is not found IMMEDIATELY -- the same answer an invented one gets, so a '
  'holder cannot distinguish "withdrawn" from "never existed"');

select * from finish();
rollback;
