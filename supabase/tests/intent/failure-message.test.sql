-- SPEC-002 REQ-8 · a failing proof is legible.
--
-- "Expected 0, got 1" is true and useless at 2am. A cross-tenant failure has to say WHICH table,
-- WHICH command, WHO was asking, and WHICH row they reached -- because the first question after a
-- red isolation run is always "what exactly got out", and a suite that cannot answer it sends
-- somebody to re-derive the fixture by hand before they can start.
--
-- The pattern is a computed description rather than a helper function, and that is deliberate: a
-- shared helper would have to live somewhere. In `public` it lands in the application's generated
-- types (the prober's `_rlsa_try` already does, which is a wart, not a precedent); in `pg_temp` it
-- cannot be seen from the next file, since every pgTAP file is its own session. So the diagnostic is
-- an expression the assertion carries with it:
--
--     select is_empty($$ … $$, coalesce(<name the leak>, <the quiet case>));
--
-- The description is evaluated BEFORE the assertion runs. When nothing leaked the subquery is NULL
-- and the plain sentence stands; when something did, the message names it.
--
-- This file proves the diagnostic on a REAL leak. It does not simulate one by formatting a string:
-- it creates a table with a policy that genuinely exposes another tenant's row, reads it as somebody
-- who should not see it, and asserts the sentence that comes back.
begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email) values
  ('a1111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@leak'),
  ('b2222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@leak');
insert into public.organization (id, name, slug) values
  ('c1111111-0000-0000-0000-00000000000a','Leak A','leak-a'),
  ('c2222222-0000-0000-0000-00000000000b','Leak B','leak-b');
insert into public.organization_member values
  ('c1111111-0000-0000-0000-00000000000a','a1111111-1111-1111-1111-111111111111','owner',now()),
  ('c2222222-0000-0000-0000-00000000000b','b2222222-2222-2222-2222-222222222222','owner',now());

-- A table that leaks. `using (true)` is the shape the schema guard exists to refuse on writes, and
-- on a read policy it is the plainest possible cross-tenant hole: every row, to everyone.
create table public.leaky (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id) on delete cascade,
  secret text not null
);
alter table public.leaky enable row level security;
alter table public.leaky force row level security;
create policy leaky_read on public.leaky for select to authenticated using (true);
grant select on public.leaky to authenticated;

insert into public.leaky (id, organization_id, secret) values
  ('d0000000-0000-0000-0000-00000000000a','c1111111-0000-0000-0000-00000000000a','A secret'),
  ('d0000000-0000-0000-0000-00000000000b','c2222222-0000-0000-0000-00000000000b','B secret');

-- The diagnostic, as the intent suite writes it. Computed here so the assertions below can read the
-- exact sentence a failing run would print.
-- `security_invoker = true` is load-bearing, not boilerplate. Since PG15 a view runs with its
-- OWNER's rights by default, and this one is owned by `postgres`, which carries rolbypassrls -- so
-- without it the diagnostic would read every row regardless of policy and would report a leak on a
-- schema that has none. The thing being measured is what the CALLER can reach.
create temporary view diagnostic with (security_invoker = true) as
  select coalesce(
    (select format(
       'LEAK public.leaky SELECT — identity %s reached row %s belonging to organization %s',
       coalesce(current_setting('request.jwt.claim.sub', true), '(none)'), l.id, l.organization_id)
     from public.leaky l
     where l.organization_id <> 'c1111111-0000-0000-0000-00000000000a'
     limit 1),
    'no row from another organization is visible'
  ) as message;

grant select on diagnostic to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = 'a1111111-1111-1111-1111-111111111111';

-- ── the leak is real, not simulated ─────────────────────────────────────────
select isnt_empty(
  $$select 1 from public.leaky where organization_id = 'c2222222-0000-0000-0000-00000000000b'$$,
  'the fixture genuinely leaks -- otherwise the message below is a string nobody would ever see');

-- ── REQ-8 · the message names all four things ───────────────────────────────
select matches((select message from diagnostic), 'public\.leaky',
  'REQ-8: the message names the TABLE');
select matches((select message from diagnostic), 'SELECT',
  'REQ-8: the message names the COMMAND');
select matches((select message from diagnostic), 'a1111111-1111-1111-1111-111111111111',
  'REQ-8: the message names the IDENTITY that was asking');
select matches((select message from diagnostic), 'd0000000-0000-0000-0000-00000000000b',
  'REQ-8: the message names the ROW that was reached -- the answer to "what exactly got out"');

-- ── and it says nothing alarming when nothing leaked ────────────────────────
-- The same expression, against a policy that holds. A diagnostic that names a row unconditionally
-- would be worse than none: every green run would read like a breach.
reset role;
drop policy leaky_read on public.leaky;
create policy leaky_read on public.leaky for select to authenticated
  using (public.is_org_member(organization_id));
set local role authenticated;
select is((select message from diagnostic), 'no row from another organization is visible',
  'REQ-8: with the policy corrected the same expression is quiet -- it reports, it does not accuse');

select * from finish();
rollback;
