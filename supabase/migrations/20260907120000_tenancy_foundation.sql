-- SPEC-001 Tenancy foundation.
-- Every choice here is traceable to a REQ and, where marked, to a measured spike/smoke finding.

-- ── REQ-1 · the root tenant entity ───────────────────────────────────────────
create table public.organization (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 200),
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  created_at timestamptz not null default now()
);

-- REQ-7 · the role model, defined once in SQL. The TypeScript copy is pinned equal to this by test.
create type public.org_role as enum ('owner', 'admin', 'member');

create table public.organization_member (
  organization_id uuid not null references public.organization(id) on delete cascade,  -- REQ-10
  user_id         uuid not null references auth.users(id)          on delete cascade,  -- REQ-10
  role            public.org_role not null default 'member',
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- REQ-5 · the PK covers (organization_id, user_id); this covers the reverse lookup.
create index organization_member_user_idx on public.organization_member (user_id, organization_id);

-- ── REQ-6, REQ-11 · membership predicates ────────────────────────────────────
-- SECURITY DEFINER with a pinned search_path (REQ-6) and a SCALAR return (REQ-11).
--
-- MEASURED (spike F-2): on Supabase `postgres` is not a superuser but HAS rolbypassrls, so these
-- run with RLS bypassed. That is what makes them non-recursive when used inside a policy on
-- organization_member -- and it is also why they must never return rows. A definer function here
-- returning a row type would be a total isolation bypass that no policy and no test would see.
create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
  select exists (
    select 1 from public.organization_member m
    where m.organization_id = org and m.user_id = (select auth.uid())   -- REQ-5: evaluated once
  );
$$;

create or replace function public.org_role_of(org uuid)
returns public.org_role language sql stable security definer set search_path = public, pg_catalog as $$
  select m.role from public.organization_member m
  where m.organization_id = org and m.user_id = (select auth.uid());
$$;

create or replace function public.is_org_admin(org uuid)
returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
  select public.org_role_of(org) in ('owner', 'admin');
$$;

-- REQ-11 · MEASURED (smoke S-4): Postgres grants EXECUTE on new functions to PUBLIC, so on a real
-- stack these were callable by `anon` -- an unauthenticated oracle over an RLS-protected table.
revoke execute on function public.is_org_member(uuid)  from public, anon;
revoke execute on function public.org_role_of(uuid)    from public, anon;
revoke execute on function public.is_org_admin(uuid)   from public, anon;
grant  execute on function public.is_org_member(uuid)  to authenticated;
grant  execute on function public.org_role_of(uuid)    to authenticated;
grant  execute on function public.is_org_admin(uuid)   to authenticated;

-- ── REQ-2 · the worked example of a tenant-scoped table ──────────────────────
-- Reference implementation: it carries organization_id directly (never a join chain), which is what
-- makes the scoped-table set machine-derivable (REQ-8). Deletable in one commit (bar B-6).
create table public.project (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id) on delete cascade,  -- REQ-10
  name            text not null check (length(trim(name)) between 1 and 200),
  created_at      timestamptz not null default now()
);
create index project_org_idx on public.project (organization_id);

-- ── REQ-3 · RLS on, deny by default ──────────────────────────────────────────
alter table public.organization        enable row level security;
alter table public.organization_member enable row level security;
alter table public.project             enable row level security;

-- Defense in depth only. MEASURED (spike F-2): FORCE does NOT stop the current owner, because
-- postgres bypasses via rolbypassrls rather than via ownership. It is set because it is free and
-- becomes real if ownership ever moves to a non-bypassing role -- NOT because it mitigates today.
alter table public.organization        force row level security;
alter table public.organization_member force row level security;
alter table public.project             force row level security;

-- ── policies ─────────────────────────────────────────────────────────────────
-- Every write policy carries a WITH CHECK that actually constrains the organization (REQ-4).
-- MEASURED (spike F-3): a USING-only write policy lets a member insert into another org, and the
-- smuggled row is invisible to them -- so a read-based test can never catch it.

create policy organization_select on public.organization
  for select to authenticated using (public.is_org_member(id));
create policy organization_insert on public.organization
  for insert to authenticated with check (true);  -- creating your own org; membership is granted by the trigger below
create policy organization_update on public.organization
  for update to authenticated using (public.is_org_admin(id)) with check (public.is_org_admin(id));
create policy organization_delete on public.organization
  for delete to authenticated using (public.org_role_of(id) = 'owner');

create policy organization_member_select on public.organization_member
  for select to authenticated using (public.is_org_member(organization_id));
create policy organization_member_insert on public.organization_member
  for insert to authenticated with check (public.is_org_admin(organization_id));
create policy organization_member_update on public.organization_member
  for update to authenticated using (public.is_org_admin(organization_id))
                              with check (public.is_org_admin(organization_id));
create policy organization_member_delete on public.organization_member
  for delete to authenticated using (public.is_org_admin(organization_id));

create policy project_select on public.project
  for select to authenticated using (public.is_org_member(organization_id));
create policy project_insert on public.project
  for insert to authenticated with check (public.is_org_member(organization_id));
create policy project_update on public.project
  for update to authenticated using (public.is_org_member(organization_id))
                              with check (public.is_org_member(organization_id));
create policy project_delete on public.project
  for delete to authenticated using (public.is_org_admin(organization_id));

-- The creator of an organization becomes its owner, atomically. Without this, organization_insert
-- would let a user create an org they are then not a member of -- an orphan no policy can reach.
create or replace function public.grant_creator_ownership()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  insert into public.organization_member (organization_id, user_id, role)
  values (new.id, (select auth.uid()), 'owner');
  return new;
end;
$$;
create trigger organization_grant_creator_ownership
  after insert on public.organization
  -- note: `(select auth.uid())` is a policy optimization and is ILLEGAL here --
  -- Postgres rejects a subquery in a trigger WHEN condition. Per-row evaluation is fine.
  for each row when (auth.uid() is not null)
  execute function public.grant_creator_ownership();

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.organization, public.organization_member, public.project to authenticated;
