-- SPEC-007 REQ-5 and REQ-8: the event ledger, and the first grant service_role has ever held.
--
-- REQ-5: "processed events are recorded, and recorded durably". Stripe says duplicates happen and to
-- key on event ids, explicitly NOT on `created` -- "distinct events can share a timestamp" (memo 11).
-- The log is a table rather than an in-process set, so a redeployed instance still knows what it has
-- seen.

-- ── the ledger ──────────────────────────────────────────────────────────────
-- `id` is Stripe's event id and IS the primary key. That is the whole idempotency mechanism: a
-- second delivery of the same event cannot insert, so it cannot process. Deduplication is a
-- uniqueness constraint rather than a check somebody has to remember to write, which is the same
-- move as organization_id being the primary key on the entitlement table.
--
-- NOT tenant-scoped, deliberately. There is no `organization_id` column, so this table is outside
-- the schema guard's tenant-scoped set and outside the access matrix -- correctly, because it is
-- operational data about deliveries from a payment processor, not a tenant's rows. Adding the column
-- would make members able to read their own billing events, which nothing has asked for and which is
-- surface rather than feature.
create table public.stripe_event (
  id           text primary key,
  type         text not null,
  received_at  timestamptz not null default now(),
  -- Null until the work behind the 2xx finishes. REQ-8 returns before it works, so "received" and
  -- "processed" are genuinely different moments and the reconcile in REQ-6 is what closes the gap
  -- between them. A row with a null `processed_at` and an old `received_at` is exactly the thing
  -- that reconcile will look for.
  processed_at timestamptz
);

-- RLS on and FORCED even though there are no policies and no application role can reach it. Deny-all
-- is the correct posture for a table the application never reads, and FORCE is what makes it true of
-- the owner too -- on Supabase the owner carries rolbypassrls, so ENABLE alone is a weaker statement
-- than it looks (the lesson organization_invitation shipped without).
alter table public.stripe_event enable row level security;
alter table public.stripe_event force row level security;

-- ── NO service_role grant, and this migration nearly made the opposite mistake ──
-- The first draft of this file granted service_role SELECT/INSERT/UPDATE on this table and on
-- organization_entitlement, quoting 20260908150000's posture approvingly two lines above the grants:
--
--   "service_role holds NOTHING on tenant tables until something needs it ... Granting in advance
--    means the most powerful role in the system is armed for a use case that does not exist."
--
-- Nothing needs it. This increment ships the ledger SCHEMA, the delivery verifier and the handler
-- logic; the handler's dependencies are not wired, because they need the service-role client, which
-- is imported by nothing today (DEF-004). The grants were for a consumer that does not exist -- the
-- exact thing being quoted.
--
-- It was not a harmless excess either, which is the part worth recording. `rlsautotest` probes every
-- role it can REACH, so granting service_role anything made it a probed identity on EVERY tenant
-- table -- including the four it held nothing on -- and each of those cells came back UNRELIABLE,
-- because a role carrying BYPASSRLS cannot demonstrate that a policy works. One premature grant
-- turned five suites amber. The tool was right and the migration was wrong.
--
-- The grant lands in the migration that wires the handler, which is where F-80's rule is waiting for
-- it, and the access matrix will show the change on the day it is real.
-- Nothing is granted to any role. The application never reads this table, and the two things that
-- will -- the handler and the reconcile -- run as service_role and arrive with their own grant.
