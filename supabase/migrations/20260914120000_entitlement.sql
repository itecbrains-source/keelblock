-- SPEC-007 REQ-1 and REQ-7: the entitlement is a row, and the map from status to entitled is the
-- database's, not the application's.
--
-- This migration is REQ-1 ONLY. Checkout, the webhook, idempotency, reconciliation and the portal
-- are REQ-3/5/6/8 and arrive with a Stripe account. What lands here is the thing they all write to,
-- and the thing every paid surface will read -- so it is the half that has to be right first.

-- ── the eight statuses, as an enum and deliberately ─────────────────────────
-- Stripe documents exactly eight subscription statuses (memo 11). An enum makes an unknown ninth a
-- WRITE FAILURE rather than a value that defaults one way or the other, which is what AC-9 asks for:
-- "a status Stripe adds later fails the case rather than defaulting either way". A text column with
-- a lookup would default silently, and under a rule that errs toward granting (REQ-7) the silent
-- default is service given away.
create type public.subscription_status as enum (
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'paused'
);

-- ── the row ─────────────────────────────────────────────────────────────────
-- `organization_id` is the PRIMARY KEY, not a foreign key beside a surrogate id. One entitlement per
-- organization is an invariant, and a primary key enforces it structurally rather than by a unique
-- index somebody could drop. It is also the tenant key the schema guard looks for.
create table public.organization_entitlement (
  organization_id        uuid primary key references public.organization(id) on delete cascade,
  status                 public.subscription_status not null,
  -- Stripe's identifiers, stored so the reconcile in REQ-6 has something to reconcile AGAINST.
  -- Nullable: a row can exist before a subscription does, and `incomplete` is a real status.
  stripe_customer_id     text,
  stripe_subscription_id text,
  -- REQ-7: "rows carry entitlement_synced_at, and a stale row alerts rather than ageing quietly".
  -- The threshold and the alert are AC-11 and arrive with the reconcile; the column is what makes
  -- the question askable at all, so it lands with the row rather than after it.
  entitlement_synced_at  timestamptz not null default now(),
  created_at             timestamptz not null default now()
);

-- The organization_id index a scoped table normally needs is the primary key here.

-- ── REQ-3 of SPEC-003 · RLS on, and FORCED ──────────────────────────────────
-- FORCE, not just ENABLE. On Supabase the owner (`postgres`) is not a superuser but HAS rolbypassrls,
-- so ENABLE alone leaves the owner reading every tenant's rows. organization_invitation shipped
-- ENABLE-only and the access-matrix gate caught it on the run that added the table; this one does
-- not repeat that.
alter table public.organization_entitlement enable row level security;
alter table public.organization_entitlement force row level security;

-- ── the one policy ──────────────────────────────────────────────────────────
-- Members READ their own organization's entitlement. That is the whole of what an organization may
-- do to this table.
create policy organization_entitlement_select on public.organization_entitlement
  for select to authenticated using (public.is_org_member(organization_id));

-- There are deliberately NO write policies and NO write grant, and here the reason is not a shared
-- convention -- it is the thesis. ADR-006: Stripe bills, the database entitles. An organization that
-- can write this row can grant itself a plan, and every other guarantee in this spec is then a
-- statement about a value its subject controls.
--
-- The same shape as organization_invitation, for a different reason: there, writes are funnelled
-- through definer functions so expiry and single-use cannot be bypassed. Here there is no
-- application write path at all. The only writer is the Stripe webhook, and it does not exist yet.
grant select on public.organization_entitlement to authenticated;

-- NOTHING IS GRANTED TO service_role, and that is deliberate rather than an omission.
-- 20260908150000_state_service_role_privileges.sql states the posture and names this exact moment:
--
--   "service_role holds NOTHING on tenant tables until something needs it. It is the sanctioned RLS
--    bypass, so a grant to it is a deliberate act tied to a real consumer -- the Stripe webhook in
--    SPEC-007 is the canonical one ... Whoever wires that webhook grants exactly what it needs, in
--    its own migration, and the access matrix will show the change."
--
-- The webhook is REQ-8 and is not in this migration, so its grant is not either. Granting now would
-- arm the most powerful role in the system for a consumer that does not exist, which is the thing
-- that migration refused. The access matrix will show the change on the day it is real.

-- ── REQ-7 · the map, in one place, in the database ──────────────────────────
-- The entitlement decision is a function of the subscription status ALONE (REQ-7), and this is where
-- that sentence becomes executable. It lives in SQL rather than TypeScript because ADR-006's split
-- puts the decision in the database, and because two copies of a boundary are two answers to "is
-- this organization inside its plan" as soon as one of them is edited.
--
-- Stripe's own boundary, not one keelblock invented: "you can safely provision your product" on
-- `trialing`, and revoke "when the subscription is `unpaid` because payments were already attempted
-- and retried while `past_due`" (memo 11). `past_due` IS the grace period.
--
-- **It RAISES on an unmapped status rather than returning anything.** The first draft of this
-- function was a SQL `case` with no `else`, and a check confirmed what that actually does: a ninth
-- status returns NULL, NULL filters the row out of the `exists` below, and the organization is
-- silently not entitled. That is defaulting -- quietly, in the denying direction -- and AC-9 asks
-- for the opposite in as many words: "a status Stripe adds later FAILS THE CASE rather than
-- defaulting either way". Written in plpgsql so the failure is a real one with a message.
--
-- Both directions of a silent default are wrong here and it is worth saying why, because the
-- instinct is that denying is the safe one. Under REQ-7 keelblock errs toward GRANTING, so a silent
-- false contradicts the decided policy; a silent true would grant on a status nobody has read the
-- documentation for. Neither is a decision. The exception is.
create or replace function public.status_entitles(s public.subscription_status)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
begin
  case s
    when 'trialing', 'active', 'past_due' then
      return true;
    when 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused' then
      return false;
    else
      raise exception 'unmapped subscription status: %', s
        using hint =
          'SPEC-007 REQ-7 maps every Stripe status explicitly. A status added later is a decision '
          'about money and access, so it fails here rather than defaulting.';
  end case;
end;
$$;

-- The caller-facing question, shaped exactly like `is_org_member` so a policy can use it the same
-- way. SECURITY DEFINER and returns a BOOLEAN, never a row: the foundation migration's note applies
-- unchanged -- "a definer function here returning a row type would be a total isolation bypass that
-- no policy and no test would see."
--
-- An organization with no entitlement row is NOT entitled. `exists` over a missing row is false, so
-- the absent case needs no branch and cannot be forgotten.
create or replace function public.is_org_entitled(org uuid)
returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
  select exists (
    select 1 from public.organization_entitlement e
    where e.organization_id = org
      and public.status_entitles(e.status)
      and (select auth.uid()) is not null
      and public.is_org_member(org)
  );
$$;

-- MEASURED (smoke S-4, recorded in the foundation migration): Postgres grants EXECUTE on new
-- functions to PUBLIC, so without this these are callable by `anon` -- an unauthenticated oracle
-- over an RLS-protected table.
revoke execute on function public.status_entitles(public.subscription_status) from public, anon;
revoke execute on function public.is_org_entitled(uuid)                       from public, anon;
grant  execute on function public.status_entitles(public.subscription_status) to authenticated;
grant  execute on function public.is_org_entitled(uuid)                       to authenticated;
