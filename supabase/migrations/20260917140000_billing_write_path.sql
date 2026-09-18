-- SPEC-007 REQ-5 / REQ-6 — the webhook handler and the reconcile get a write path.
--
-- **And `service_role` still holds nothing on any tenant table.** That is the decision this file
-- makes, it reverses what three earlier artifacts anticipated, and it was made by measurement rather
-- than by preference. The reasoning is here because the next person to want a table grant will read
-- this file, not a commit message.
--
-- ── What was planned, and why it does not survive contact ────────────────────
--
-- `20260917120000` says the grant "lands in the migration that wires the handler", meaning
-- SELECT/INSERT/UPDATE for `service_role` on `stripe_event` and `organization_entitlement`.
-- `check-policies.mjs` already DESCRIBES that end state, and `007-entitlement.test.sql` carries two
-- assertions written knowing they would change on this day.
--
-- F-81 recorded that a premature grant made `service_role` a probed identity on every tenant table
-- and turned five suites `UNRELIABLE`, and prescribed "narrow the grant". **MEASURED 2026-09-17: a
-- narrow grant does not help.** Granting exactly the two tables above, and nothing else, reproduced
-- it in full — `rlsautotest` discovers probe identities from role grants GLOBALLY, not per table, so
-- one grant anywhere makes `service_role` a probed identity everywhere:
--
--     organization              SELECT, UPDATE, DELETE   UNRELIABLE
--     organization_entitlement  SELECT, UPDATE           UNRELIABLE
--     organization_invitation   SELECT                   UNRELIABLE
--     project                   SELECT, UPDATE, DELETE   UNRELIABLE
--
-- with the tool's own explanation: "probing as 'service_role' bypasses RLS: the role carries
-- BYPASSRLS, so a passing observation here cannot distinguish a correct policy from a broken one."
--
-- Narrowness was never the variable. The only exits the tool offers are `--allow-unreliable` per
-- cell — the per-table allowlist F-80 was written to end, and F-81's named trap — or
-- `ALTER ROLE service_role NOBYPASSRLS`, which changes the semantics of a platform role that GoTrue
-- and Storage also use. Neither is acceptable for a project whose one claim is that its isolation
-- proofs mean something.
--
-- ── What this does instead ───────────────────────────────────────────────────
--
-- The write path is four `SECURITY DEFINER` functions, EXECUTE-able by `service_role` alone.
-- `service_role` gains no table privilege, so it is not a probed identity, so no suite turns amber
-- and no allowlist grows by a single entry. `20260908150000`'s posture — "service_role holds NOTHING
-- on tenant tables" — is kept rather than spent, and `007`'s two assertions stay TRUE rather than
-- needing rewriting.
--
-- It is also strictly less power than the grant would have been: a table grant permits any INSERT or
-- UPDATE of any shape; these permit exactly four operations with fixed statements inside them.
--
-- **The cost, stated rather than discovered later (F-85).** This adds to the class of write paths
-- that are mediated by a function body rather than by a policy, which a policy prober cannot see.
-- That is a real trade and it is bounded here by two things: `organization_entitlement` has no write
-- policy for anyone and never will — an organization that could write this row would be granting
-- itself a plan (ADR-006), so there was never policy coverage to lose — and every function below is
-- asserted in `007-entitlement.test.sql` against each role that must not reach it.

-- ── 1 · claim an event, idempotently ────────────────────────────────────────
-- REQ-5. The claim IS the idempotency: `id` is Stripe's event id and the primary key, so a second
-- delivery cannot insert and therefore cannot process. Returns whether this caller is the first,
-- which is the only thing the handler needs to know.
create or replace function public.claim_stripe_event(event_id text, event_type text)
returns boolean language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  claimed integer;
begin
  insert into public.stripe_event (id, type)
  values (event_id, event_type)
  on conflict (id) do nothing;
  get diagnostics claimed = row_count;
  return claimed = 1;
end;
$$;

-- ── 2 · mark it processed, LAST ─────────────────────────────────────────────
-- REQ-8 returns a 2xx before the work, so "received" and "processed" are different moments. A row
-- with a null `processed_at` is exactly what the reconcile looks for, so this is called after the
-- entitlement write and never before it.
create or replace function public.mark_stripe_event_processed(event_id text)
returns void language sql security definer set search_path = public, pg_catalog as $$
  update public.stripe_event set processed_at = now() where id = event_id;
$$;

-- ── 3 · which organization a Stripe customer belongs to ─────────────────────
-- Returns a uuid, never a row. The foundation migration's warning is explicit that a definer
-- function returning a row type here would be a total isolation bypass no policy and no test would
-- see; this returns one scalar that the caller already has the customer id for.
create or replace function public.organization_for_stripe_customer(customer text)
returns uuid language sql stable security definer set search_path = public, pg_catalog as $$
  select organization_id from public.organization_entitlement
  where stripe_customer_id = customer
  limit 1;
$$;

-- ── 4 · write the authoritative state ───────────────────────────────────────
-- REQ-3: the caller has already RE-READ the subscription from Stripe; this records what it found. It
-- never computes state from a payload, because it is never given one — the signature takes a status,
-- not an event.
--
-- `entitlement_synced_at` is set on every write, including a write that changes nothing, because the
-- question it answers is "when did we last confirm this against Stripe" and not "when did this last
-- change". REQ-7 depends on that reading: a row that has stopped being refreshed is the reachable
-- failure, and under a rule that errs toward granting it is service given away indefinitely.
create or replace function public.write_entitlement(
  org uuid,
  new_status public.subscription_status,
  customer text,
  subscription text
)
returns void language sql security definer set search_path = public, pg_catalog as $$
  insert into public.organization_entitlement
    (organization_id, status, stripe_customer_id, stripe_subscription_id, entitlement_synced_at)
  values (org, new_status, customer, subscription, now())
  on conflict (organization_id) do update
    set status                = excluded.status,
        stripe_customer_id    = excluded.stripe_customer_id,
        stripe_subscription_id = excluded.stripe_subscription_id,
        entitlement_synced_at  = now();
$$;

-- ── 5 · what the reconcile must ask Stripe about ────────────────────────────
-- REQ-6. Three days of Stripe retries is also three days in which nothing may arrive, so a periodic
-- reconcile is the only thing that closes a missed event. This is the read half: every entitlement
-- that names a subscription, so the job can ask Stripe what that subscription IS and correct drift
-- without any webhook having arrived.
--
-- This one DOES return rows, which is the exception the foundation migration warns about, so it is
-- bounded deliberately: EXECUTE is revoked from `public`, `anon` and `authenticated` below and
-- granted to `service_role` alone — an identity only reachable with the secret key, which never
-- appears in a browser. `007-entitlement.test.sql` asserts each of those refusals rather than
-- asserting about them.
create or replace function public.entitlements_to_reconcile()
returns table (
  organization_id uuid,
  status public.subscription_status,
  stripe_customer_id text,
  stripe_subscription_id text,
  entitlement_synced_at timestamptz
)
language sql stable security definer set search_path = public, pg_catalog as $$
  select e.organization_id, e.status, e.stripe_customer_id, e.stripe_subscription_id,
         e.entitlement_synced_at
  from public.organization_entitlement e
  where e.stripe_subscription_id is not null
  order by e.entitlement_synced_at asc;
$$;

-- ── the grants, and only these ──────────────────────────────────────────────
-- MEASURED (smoke S-4, recorded in the foundation migration): Postgres grants EXECUTE on new
-- functions to PUBLIC, so without these revokes every one of the above is callable by `anon` — an
-- unauthenticated write path into the billing ledger.
revoke execute on function public.claim_stripe_event(text, text)              from public, anon, authenticated;
revoke execute on function public.mark_stripe_event_processed(text)           from public, anon, authenticated;
revoke execute on function public.organization_for_stripe_customer(text)      from public, anon, authenticated;
revoke execute on function public.write_entitlement(uuid, public.subscription_status, text, text)
                                                                              from public, anon, authenticated;
revoke execute on function public.entitlements_to_reconcile()                 from public, anon, authenticated;

grant execute on function public.claim_stripe_event(text, text)               to service_role;
grant execute on function public.mark_stripe_event_processed(text)            to service_role;
grant execute on function public.organization_for_stripe_customer(text)       to service_role;
grant execute on function public.write_entitlement(uuid, public.subscription_status, text, text)
                                                                              to service_role;
grant execute on function public.entitlements_to_reconcile()                  to service_role;

comment on function public.write_entitlement(uuid, public.subscription_status, text, text) is
  'SPEC-007 REQ-3/REQ-5. The billing write path is EXECUTE-only for service_role, which holds no '
  'table privilege on any tenant table -- measured 2026-09-17, a table grant of any width makes '
  'service_role a probed identity on every tenant table and turns five suites UNRELIABLE (F-81).';
