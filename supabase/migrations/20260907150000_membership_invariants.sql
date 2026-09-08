-- Two defects found by auditing the schema against its own claims, both measured before this fix:
--
--   1. PRIVILEGE ESCALATION -- an admin ran `update organization_member set role='member'` against
--      the owner and it returned `UPDATE 1`. An admin could seize any organization. The `owner`
--      role means nothing if an admin can remove it.
--   2. ORPHANED ORGANIZATION -- the last owner deleted their own membership, leaving orgs=1,
--      members=0. Nobody can administer it, nobody can delete it (delete requires owner), and it
--      holds its slug forever.
--
-- These are enforced as TRIGGERS, not policies, deliberately. RLS governs who may *attempt* an
-- action; a trigger governs what must remain *true* afterwards -- and a policy cannot express "the
-- organization must still have an owner when you are done", because a policy sees one row.
--
-- Scope, stated honestly: both triggers constrain USER-initiated changes -- statements with a
-- session (`auth.uid()`). A service-role holder is not constrained by them, and pretending
-- otherwise would be theater: that identity already bypasses RLS and could drop these triggers
-- outright. It is also load-bearing in practice -- an earlier version enforced the invariant
-- unconditionally and broke the policy prober, whose fixture legitimately wipes the table.

create or replace function public.enforce_owner_authority()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  actor        uuid := (select auth.uid());
  actor_role   public.org_role;
  org          uuid := coalesce(new.organization_id, old.organization_id);
  owners_exist boolean;
begin
  -- No session: a migration, a seed, or a deliberate service-role operation. Actor authority is not
  -- checkable and not meaningful here; the last-owner INVARIANT below still applies to these paths.
  if actor is null then
    return coalesce(new, old);
  end if;

  select exists (select 1 from public.organization_member
                  where organization_id = org and role = 'owner') into owners_exist;

  -- Bootstrap: the first owner of a brand-new organization, created by create_organization().
  if tg_op = 'INSERT' and new.role = 'owner' and not owners_exist then
    return new;
  end if;

  select role into actor_role from public.organization_member
   where organization_id = org and user_id = actor;

  -- Any row that IS an owner, or is BECOMING one, may only be touched by an owner.
  if (tg_op = 'INSERT' and new.role = 'owner')
     or (tg_op = 'UPDATE' and (old.role = 'owner' or new.role = 'owner'))
     or (tg_op = 'DELETE' and old.role = 'owner')
  then
    if actor_role is distinct from 'owner' then
      raise exception 'only an owner may grant, revoke or remove ownership'
        using errcode = 'P0001';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger organization_member_owner_authority
  before insert or update or delete on public.organization_member
  for each row execute function public.enforce_owner_authority();

-- The invariant, checked at the end of each STATEMENT (`initially immediate`).
--
-- `initially deferred` was tried first and was wrong twice over: the error surfaced only at COMMIT,
-- so a caller learned of it far from the statement that caused it, and it was invisible to a test
-- asserting on the statement. Per-statement checking still permits succession, because succession is
-- naturally two statements in order -- promote the new owner, then step down -- and the intermediate
-- state after each one is legal.
create or replace function public.enforce_organization_has_owner()
returns trigger language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  org uuid := coalesce(new.organization_id, old.organization_id);
begin
  -- No session: a migration, a seed, an administrative teardown, or the policy prober's fixture
  -- reset. Deliberate service-role work is trusted; see the scope note at the top of this file.
  if (select auth.uid()) is null then
    return null;
  end if;

  -- If the organization itself is gone (cascade), there is nothing left to own.
  if not exists (select 1 from public.organization where id = org) then
    return null;
  end if;
  if not exists (select 1 from public.organization_member
                  where organization_id = org and role = 'owner') then
    raise exception 'an organization must always have at least one owner'
      using errcode = 'P0001',
            hint = 'promote another member to owner before stepping down';
  end if;
  return null;
end;
$$;

create constraint trigger organization_member_has_owner
  after update or delete on public.organization_member
  deferrable initially immediate
  for each row execute function public.enforce_organization_has_owner();
