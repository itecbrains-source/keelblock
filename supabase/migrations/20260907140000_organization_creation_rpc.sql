-- Organisation creation moves from an INSERT policy to a SECURITY DEFINER RPC.
--
-- Why: the previous policy was `with check (true)` -- the only unconstrained write policy in the
-- schema, and precisely the defect shape SPEC-001 REQ-4 forbids and the gate rejects. It was also a
-- spam vector (any authenticated user could create unlimited organisations), and it made the access
-- matrix cry wolf: the prober inserted an organisation as an outsider, the trigger made them its
-- owner, and the resulting legitimate self-access rendered as "REACHABLE by a different
-- organisation". A matrix with a false positive in it trains people to ignore the true ones.
--
-- Verified before changing: an outsider could never read anyone else's organisation. The isolation
-- was correct; the affordance was wrong.

drop trigger if exists organization_grant_creator_ownership on public.organization;
drop function if exists public.grant_creator_ownership();
drop policy if exists organization_insert on public.organization;

-- Creating an organisation and becoming its owner is ONE act, so it is one transaction with one
-- entry point. Returns a scalar (SPEC-001 REQ-11): a definer function here must never return rows.
create or replace function public.create_organization(org_name text, org_slug text)
returns uuid language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  new_id uuid;
  uid    uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if org_name is null or length(trim(org_name)) = 0 then
    raise exception 'organisation name is required' using errcode = '22023';
  end if;
  if org_slug !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then
    raise exception 'slug must be lowercase letters, numbers and hyphens' using errcode = '22023';
  end if;

  insert into public.organization (name, slug) values (trim(org_name), org_slug)
  returning id into new_id;

  insert into public.organization_member (organization_id, user_id, role)
  values (new_id, uid, 'owner');

  return new_id;
exception
  when unique_violation then
    raise exception 'that slug is already taken' using errcode = '23505';
end;
$$;

revoke execute on function public.create_organization(text, text) from public, anon;
grant  execute on function public.create_organization(text, text) to authenticated;

-- No INSERT policy on organization: RLS denies by default, so the RPC is the only way in.
