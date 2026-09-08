-- The last role whose privileges were inherited rather than stated. Same lesson as F-31, found on
-- the same CI run, one image apart.
--
-- On supabase/postgres:17.6.1.140 `service_role` holds no DML on tables in `public`. On 17.6.1.167
-- it holds all of it. That is not a cosmetic difference: the prober probes any role it can reach, so
-- on the newer image it probed service_role as if it were a constrained user, found it bypassing RLS
-- (it carries BYPASSRLS), and reported three cells UNRELIABLE —
--
--   "probing as 'service_role' bypasses RLS: a passing observation here cannot distinguish a correct
--    policy from a broken one. If the bypass is intentional, do not probe it as a constrained user."
--
-- — which is correct advice, and which means the access matrix's CONTENT depends on which image the
-- stack happened to pull. A generated artifact compared byte-for-byte cannot survive that.
--
-- The posture chosen is the one F-28 already reasoned out and this makes explicit: service_role holds
-- NOTHING on tenant tables until something needs it. It is the sanctioned RLS bypass, so a grant to
-- it is a deliberate act tied to a real consumer — the Stripe webhook in SPEC-007 is the canonical
-- one, and `src/lib/supabase/server-only/admin.ts` is imported by nothing today (DEF-004). Granting
-- in advance means the most powerful role in the system is armed for a use case that does not exist.
--
-- Whoever wires that webhook grants exactly what it needs, in its own migration, and the access
-- matrix will show the change. That is the point of the artifact.

revoke all on all tables in schema public from service_role;
revoke all on all sequences in schema public from service_role;

alter default privileges in schema public revoke all on tables from service_role;
alter default privileges in schema public revoke all on sequences from service_role;
alter default privileges for role postgres in schema public revoke all on tables from service_role;
alter default privileges for role postgres in schema public revoke all on sequences from service_role;
