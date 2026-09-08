-- SPEC-003 REQ-2 · the new-table guard's detection query, proven against planted violations.
--
-- The guard's real logic is this SQL, so it is tested as SQL. Each case plants a genuine
-- misconfiguration inside the transaction and asserts the query finds it; the rollback leaves
-- nothing behind. A unit test of the surrounding string-splitting would prove nothing about the
-- thing that actually protects the data.
begin;
select plan(6);

create or replace function pg_temp.guard_violations() returns setof text language sql as $$
  with scoped as (
    select c.oid, c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and (c.relname = 'organization' or exists (
        select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'organization_id'
          and a.attnum > 0 and not a.attisdropped))
  )
  select s.relname || ': ' || f.violation from scoped s
  cross join lateral (
    select 'rls-disabled' as violation where not s.relrowsecurity
    union all select 'no-policy' where not exists (select 1 from pg_policy p where p.polrelid = s.oid)
    union all select 'no-with-check' from pg_policy p
      where p.polrelid = s.oid and p.polcmd in ('a','w','*') and p.polwithcheck is null
    union all select 'trivial-with-check' from pg_policy p
      where p.polrelid = s.oid and p.polcmd in ('a','w','*')
        and pg_get_expr(p.polwithcheck, p.polrelid) in ('true','(true)')
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
create policy planted_read on public.planted for select to authenticated
  using (public.is_org_member(organization_id));
create policy planted_write on public.planted for insert to authenticated with check (true);
select ok(exists(select 1 from pg_temp.guard_violations() v where v like 'planted: trivial-with-check'),
  'a WITH CHECK of literal true is caught -- polwithcheck IS NULL would miss it entirely');

drop policy planted_write on public.planted;
create policy planted_write on public.planted for insert to authenticated
  with check (public.is_org_member(organization_id));
select is((select count(*)::int from pg_temp.guard_violations()), 0,
  'a correctly protected table produces no violation');

alter table public.organization disable row level security;
select ok(exists(select 1 from pg_temp.guard_violations() v where v like 'organization: rls-disabled'),
  'the ROOT table is covered -- it is scoped by its own id, not an organization_id column');

rollback;
