-- Revoke destructive privileges that Supabase's default ACLs hand to anon and authenticated.
--
-- MEASURED on a clean local stack: `set role anon; truncate public.organization cascade;` SUCCEEDED,
-- cascading to organization_member and project. Every tenant's rows, removed, unauthenticated.
--
-- Cause: pg_default_acl grants `Dxtm` (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) to anon and
-- authenticated for tables created by postgres -- and **RLS does not apply to TRUNCATE at all**.
-- No policy in this repo can prevent it, so it is invisible to every policy test.
--
-- Exploitability, stated honestly: PostgREST exposes no TRUNCATE verb (verified: 404), so this is
-- not a remote zero-click. It is a defense-in-depth failure -- it turns any SQL injection in a
-- SECURITY INVOKER function, or a leaked anon/authenticated database credential, into total data
-- loss rather than a scoped read. Removing it costs nothing and removes that escalation.
--
-- This is a Supabase default, so every project inheriting it has the same grant.

revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- and for tables created later, so a new table does not silently reintroduce it
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
