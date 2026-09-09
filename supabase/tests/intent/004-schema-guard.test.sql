-- SPEC-003 REQ-2 · the new-table guard's detection query, proven against planted violations.
--
-- The guard's real logic is this SQL, so it is tested as SQL. Each case plants a genuine
-- misconfiguration inside the transaction and asserts the query finds it; the rollback leaves
-- nothing behind. A unit test of the surrounding string-splitting would prove nothing about the
-- thing that actually protects the data.
begin;
select plan(12);

create or replace function pg_temp.guard_violations() returns setof text language sql as $$
  with scoped as (
    select c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (c.relname = 'organization' or exists (
        select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organization_id'
          and a.attnum > 0 and not a.attisdropped))
  )
  select s.relname || ': ' || f.violation from scoped s
  cross join lateral (
    select 'rls-disabled' as violation where not s.relrowsecurity
    union all select 'rls-not-forced' where s.relrowsecurity and not s.relforcerowsecurity
    union all select 'no-policy' where not exists (select 1 from pg_policy p where p.polrelid = s.oid)
    union all select 'no-with-check' from pg_policy p
      where p.polrelid = s.oid and p.polcmd in ('a','w','*') and p.polwithcheck is null
    union all select 'trivial-with-check' from pg_policy p
      where p.polrelid = s.oid and p.polcmd in ('a','w','*')
        and pg_get_expr(p.polwithcheck, p.polrelid) in ('true','(true)')
    -- The strong form. "is this expression the literal true" is a string comparison that catches
    -- one spelling; these two catch the shapes a developer actually writes when a policy will not
    -- compile and they want to move on.
    union all select 'untenanted-with-check' from pg_policy p
      where p.polrelid = s.oid and p.polcmd in ('a','w','*') and p.polwithcheck is not null
        and pg_get_expr(p.polwithcheck, p.polrelid) !~ (
          case when s.relname = 'organization'
               then '(^|[^a-z_])(organization_id|id)([^a-z_]|$)'
               else '(^|[^a-z_])organization_id([^a-z_]|$)' end)
    union all select 'null-test-with-check' from pg_policy p
      where p.polrelid = s.oid and p.polcmd in ('a','w','*') and p.polwithcheck is not null
        and pg_get_expr(p.polwithcheck, p.polrelid) ~* '^\(?\s*organization_id\s+is\s+not\s+null\s*\)?$'
    -- The same two, on USING. WITH CHECK governs the write; USING governs the read and the delete,
    -- and until F-53 the gate read only the first of them.
    union all select 'untenanted-using' from pg_policy p
      where p.polrelid = s.oid and p.polcmd in ('r','w','d','*') and p.polqual is not null
        and pg_get_expr(p.polqual, p.polrelid) !~ (
          case when s.relname = 'organization'
               then '(^|[^a-z_])(organization_id|id)([^a-z_]|$)'
               else '(^|[^a-z_])organization_id([^a-z_]|$)' end)
    union all select 'null-test-using' from pg_policy p
      where p.polrelid = s.oid and p.polcmd in ('r','w','d','*') and p.polqual is not null
        and pg_get_expr(p.polqual, p.polrelid) ~* '^\(?\s*organization_id\s+is\s+not\s+null\s*\)?$'
  ) f;
$$;

select is((select count(*)::int from pg_temp.guard_violations()), 0,
  'BASELINE: the real schema has no violations');

create table public.planted (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id) on delete cascade,
  secret text
);
select ok(exists(select 1 from pg_temp.guard_violations() v where v like 'planted: rls-disabled'),
  'a new tenant table with RLS off is caught');
select ok(exists(select 1 from pg_temp.guard_violations() v where v like 'planted: no-policy'),
  'a new tenant table with no policy is caught');

alter table public.planted enable row level security;
-- ENABLE without FORCE. The realistic mistake -- it looks protected, `relrowsecurity` is true, and
-- the owner (and therefore every definer function) still reads every tenant's rows. This is exactly
-- what `organization_invitation` shipped as before the access-matrix gate caught it.
select ok(exists(select 1 from pg_temp.guard_violations() v where v like 'planted: rls-not-forced'),
  'ENABLE without FORCE is caught -- relrowsecurity is true and the owner still bypasses it');
alter table public.planted force row level security;
create policy planted_read on public.planted for select to authenticated
  using (public.is_org_member(organization_id));
create policy planted_write on public.planted for insert to authenticated with check (true);
select ok(exists(select 1 from pg_temp.guard_violations() v where v like 'planted: trivial-with-check'),
  'a WITH CHECK of literal true is caught -- polwithcheck IS NULL would miss it entirely');

-- Each of these looks like a constraint and constrains nothing about WHICH tenant. The literal-true
-- rule missed all four; they are the realistic spellings, not exotic ones.
drop policy planted_write on public.planted;
create policy planted_write on public.planted for insert to authenticated with check (1=1);
select ok(exists(select 1 from pg_temp.guard_violations() v where v like 'planted: untenanted-with-check'),
  'a WITH CHECK of 1=1 is caught -- a string comparison against ''true'' is not the rule');

drop policy planted_write on public.planted;
create policy planted_write on public.planted for insert to authenticated
  with check (auth.uid() is not null);
select ok(exists(select 1 from pg_temp.guard_violations() v where v like 'planted: untenanted-with-check'),
  'a WITH CHECK that only proves you are logged in is caught -- it names no tenant');

drop policy planted_write on public.planted;
create policy planted_write on public.planted for insert to authenticated
  with check (organization_id is not null);
select ok(exists(select 1 from pg_temp.guard_violations() v where v like 'planted: null-test-with-check'),
  'a WITH CHECK that only proves the tenant key is PRESENT is caught -- present is not yours');

drop policy planted_write on public.planted;
create policy planted_write on public.planted for insert to authenticated
  with check (public.is_org_member(organization_id));

-- ── the READ and DELETE decision (F-53) ──────────────────────────────────────
-- A total read leak. Before the USING rules existed this table was reported protected, because a
-- correct WITH CHECK was the only thing being read: you could not write another tenant's row, and
-- you could select every one of them.
drop policy planted_read on public.planted;
create policy planted_read on public.planted for select to authenticated using (true);
select ok(exists(select 1 from pg_temp.guard_violations() v where v like 'planted: untenanted-using'),
  'a USING of literal true is caught -- WITH CHECK protects the write, not the read');

drop policy planted_read on public.planted;
create policy planted_read on public.planted for select to authenticated
  using (organization_id is not null);
select ok(exists(select 1 from pg_temp.guard_violations() v where v like 'planted: null-test-using'),
  'a USING that only proves the tenant key is PRESENT is caught -- same shape, other clause');

drop policy planted_read on public.planted;
create policy planted_read on public.planted for select to authenticated
  using (public.is_org_member(organization_id));
select is((select count(*)::int from pg_temp.guard_violations()), 0,
  'a correctly protected table produces no violation');

alter table public.organization disable row level security;
select ok(exists(select 1 from pg_temp.guard_violations() v where v like 'organization: rls-disabled'),
  'the ROOT table is covered -- it is scoped by its own id, not an organization_id column');

rollback;
