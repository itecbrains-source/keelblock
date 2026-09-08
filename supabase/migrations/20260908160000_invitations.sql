-- SPEC-006 · invitations.
--
-- pgcrypto lives in `extensions`, not `public`, so every call to it here is SCHEMA-QUALIFIED. The
-- alternative -- adding `extensions` to each definer's search_path -- would work and is looser:
-- SPEC-001 REQ-6 pins these paths precisely because an unpinned or widened one on a definer function
-- is a documented privilege-escalation class. Qualifying costs eleven characters and depends on
-- nothing.
--
-- The first row in this schema that must be readable by somebody who is not a member. The exception
-- is taken in ONE place with a stated shape (research/09-INVITATION-BOUNDARY.md), because the
-- alternative -- a policy admitting `anon` plus an application-side token filter -- is F-15's shape:
-- the row is in memory before anything decides the caller was entitled to it.

create table public.organization_invitation (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organization(id) on delete cascade,  -- SPEC-001 REQ-10
  -- No CHECK on the shape of this address, and that is a decision rather than an omission.
  --
  -- It carried `check (position('@' in email) > 1)` first. The generated prober synthesizes rows to
  -- probe a policy and fills a text column with 'x', so the constraint made this table the ONE
  -- tenant table the exhaustive layer could not test -- and it is the table with the only
  -- stranger-facing surface in the schema, so it is the last one to hand a coverage transfer.
  --
  -- The rule did not disappear; it moved to `invite_member`, which is the ONLY thing that can write
  -- here. There is no INSERT grant and no INSERT policy, so a definer function is not merely the
  -- convenient place for the check, it is the exhaustive one -- and it can say what is wrong, which
  -- a constraint violation cannot. The trade is deliberate: a validity rule enforced on the single
  -- write path, in exchange for the isolation proof on the table that most needs it.
  email           text not null,
  role            public.org_role not null default 'member',
  -- REQ-3 · sha256 of the token. The plaintext exists only in the emailed link, so a leaked table is
  -- not a set of working invitations.
  token_hash      bytea not null unique,
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  accepted_by     uuid references auth.users(id) on delete set null,
  revoked_at      timestamptz,
  created_by      uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now()
);

create index organization_invitation_org_idx on public.organization_invitation (organization_id);

alter table public.organization_invitation enable row level security;
-- FORCE, not just ENABLE. On Supabase the owner (`postgres`) is not a superuser but HAS
-- rolbypassrls, so ENABLE alone leaves the owner reading every tenant's rows -- which is why the
-- other three tenant tables have carried this line since 20260907120000. This one did not, and no
-- test noticed: the access-matrix gate did, on the run that added the table.
alter table public.organization_invitation force row level security;

-- REQ-1 · the ONE policy admits admins to READ their own organization's invitations. A stranger
-- reads nothing here; that is the whole point of taking the exception elsewhere.
create policy organization_invitation_select on public.organization_invitation
  for select to authenticated using (public.is_org_admin(organization_id));

-- There are deliberately NO write policies and NO write grant. Every write runs through the definer
-- functions below, which is where expiry, hashing, single-use and the admin re-check live. A first
-- draft of this file carried admin insert/update/delete policies, and they were the exact mirror of
-- the defect 20260908130000 records: that migration revoked a GRANT with no policy behind it; these
-- were POLICIES with no grant in front of them. Dead either way -- and the repair that makes them
-- live is worse than the disease, because granting UPDATE to satisfy an admin update policy hands
-- an admin a way to move `expires_at` or clear `accepted_at` without passing a single one of those
-- rules. One write path, or the rules are decorative.
grant select on public.organization_invitation to authenticated;

-- REQ-2 · the return shape IS the boundary, so it is a named type rather than an inline record.
-- Widening it means altering a type in a migration, which is a reviewable event; returning the row
-- would hand a stranger the organization id, the invitee's email and the inviter.
create type public.invitation_preview_result as (
  organization_name text,
  invited_role      public.org_role
);

-- REQ-1 · an admin mints an invitation and receives the token exactly once.
--
-- SECURITY DEFINER, but it re-checks authority itself: definer means RLS is bypassed, so the policy
-- above would not stop a member calling this. SPEC-001 REQ-11's discipline applies -- pinned
-- search_path, EXECUTE revoked from public and anon.
create or replace function public.invite_member(org uuid, invitee_email text, invited_role public.org_role)
returns text language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  token text;
begin
  if not public.is_org_admin(org) then
    raise insufficient_privilege using message = 'not an administrator of this organization';
  end if;
  -- The validity rule for the address, on the only path that can write one. Deliberately the same
  -- weak shape check the column used to carry -- an address is proven by delivering to it, not by a
  -- regular expression, and a stricter pattern here would reject real addresses to no end.
  if position('@' in invitee_email) < 2 or length(invitee_email) > 320 then
    raise invalid_parameter_value using message = 'not an email address';
  end if;
  -- REQ-7 · ownership is not invitable, and refusing it HERE is the whole point.
  --
  -- MEASURED: an `owner` invitation could be minted and could never be accepted. The SPEC-001
  -- owner-authority trigger fires on the membership insert inside `accept_invitation` -- "only an
  -- owner may grant, revoke or remove ownership" -- and the invitee is, by definition, not one yet.
  -- So the invitee read "T has invited you to join as owner", pressed Accept, and got "invitation
  -- not found" forever. A dead affordance.
  --
  -- The fix is not to let acceptance through. `accept_invitation` is SECURITY DEFINER, so making it
  -- succeed means bypassing that trigger -- and an ADMIN can mint invitations, which would turn a
  -- token into a route from admin to owner that the trigger exists to close. Ownership succession
  -- stays where SPEC-001 put it: an existing owner promotes someone already inside, through the
  -- members list, where the trigger can see who is asking.
  if invited_role = 'owner' then
    raise invalid_parameter_value using message =
      'ownership cannot be invited -- an existing owner promotes a member instead';
  end if;
  -- 256 bits. The only credential the invitation has, so it is never derived from anything guessable.
  token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.organization_invitation
    (organization_id, email, role, token_hash, expires_at, created_by)
  values
    (org, invitee_email, invited_role, extensions.digest(token, 'sha256'),
     now() + interval '7 days', (select auth.uid()));
  return token;
end;
$$;

-- REQ-2, REQ-4 · what a stranger may learn: who invited them, and as what. Nothing else.
-- Spent, revoked, expired and invented tokens all return zero rows -- "already accepted" would tell
-- a stranger their guess had once been valid.
create or replace function public.invitation_preview(token text)
returns setof public.invitation_preview_result language sql stable security definer
set search_path = public, pg_catalog as $$
  select o.name, i.role
  from public.organization_invitation i
  join public.organization o on o.id = i.organization_id
  where i.token_hash = extensions.digest(token, 'sha256')
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now();
$$;

-- REQ-3, REQ-5 · acceptance. The membership is granted and the invitation spent in ONE statement,
-- so two simultaneous accepts cannot both win -- a check-then-act across two statements is a race in
-- production rather than in theory.
create or replace function public.accept_invitation(token text)
returns uuid language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  claimed public.organization_invitation;
begin
  if (select auth.uid()) is null then
    raise insufficient_privilege using message = 'sign in before accepting an invitation';
  end if;

  update public.organization_invitation
     set accepted_at = now(), accepted_by = (select auth.uid())
   where token_hash = extensions.digest(token, 'sha256')
     and accepted_at is null
     and revoked_at is null
     and expires_at > now()
  returning * into claimed;

  if claimed.id is null then
    -- One message for all four cases, matching the preview: not found.
    raise exception 'invitation not found';
  end if;

  -- REQ-5 · bound to the caller, not to the email in the row. An invitation is a capability to join,
  -- not an identity claim. REQ-7 · the SPEC-001 triggers still police what this may produce.
  insert into public.organization_member (organization_id, user_id, role)
  values (claimed.organization_id, (select auth.uid()), claimed.role)
  on conflict (organization_id, user_id) do nothing;

  return claimed.organization_id;
end;
$$;

-- REQ-6 · revoking makes the token not-found, immediately.
create or replace function public.revoke_invitation(invitation uuid)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  org uuid;
begin
  select organization_id into org from public.organization_invitation where id = invitation;
  if org is null or not public.is_org_admin(org) then
    raise insufficient_privilege using message = 'not an administrator of this organization';
  end if;
  update public.organization_invitation set revoked_at = now()
   where id = invitation and accepted_at is null;
end;
$$;

-- SPEC-001 REQ-11 · Postgres grants EXECUTE on a new function to PUBLIC, which on a real stack made
-- an earlier helper callable by `anon` (smoke S-4). `invitation_preview` is the one function here a
-- stranger may call -- that is its entire purpose -- and it is granted deliberately rather than by
-- default.
revoke execute on function public.invite_member(uuid, text, public.org_role)  from public, anon;
revoke execute on function public.accept_invitation(text)                     from public, anon;
revoke execute on function public.revoke_invitation(uuid)                     from public, anon;
revoke execute on function public.invitation_preview(text)                    from public;

grant execute on function public.invite_member(uuid, text, public.org_role)   to authenticated;
grant execute on function public.accept_invitation(text)                      to authenticated;
grant execute on function public.revoke_invitation(uuid)                      to authenticated;
grant execute on function public.invitation_preview(text)                     to anon, authenticated;
