-- Stop inheriting a platform default, and state the property instead.
--
-- FOUND BY THE FIRST CI RUN, 2026-09-08, and by nothing else that had ever run here. Locally the
-- stack builds on supabase/postgres:17.6.1.140, where `anon` holds no privilege at all on tables in
-- `public`. The GitHub runner pulled 17.6.1.167, where Supabase's default ACL grants `anon` DML on
-- them again — so this assertion, green on every local run since it was written, failed there:
--
--   # Failed test 10: "ANON: tenant tables are refused at the grant layer, before RLS is consulted"
--   #       caught: no exception    wanted: 42501
--
-- Read carefully, because the severity matters and it is not "a leak". RLS still held: every policy
-- on these tables is `to authenticated`, so an `anon` SELECT returns zero rows and an `anon` INSERT
-- is refused 42501 by the policy. What was lost on the newer image is the layer BEFORE that one —
-- the privilege check — and with it the property the repository actually claims: that an
-- unauthenticated role cannot reach a tenant table at all, whatever any policy happens to say.
--
-- The general shape is the one worth keeping: **a guarantee inherited from a platform default is not
-- a guarantee, it is a coincidence with good uptime.** 20260907130000 revoked the destructive
-- defaults explicitly and that survived the image change intact. This did not, because it was never
-- written down — it was simply true on the image we happened to run.
--
-- So: revoke, and revoke the default too, so a table added later cannot silently re-acquire it.
-- `authenticated` is deliberately untouched; its DML is granted on purpose in 20260907120000 and is
-- what every policy is written against.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;

-- Same lesson, same run: 20260908120000 revoked EXECUTE on these two from PUBLIC, which was enough
-- on 17.6.1.140 and not on 17.6.1.167, where the grant reaches `anon` by another route. The prober
-- reported both as CRITICAL bypass surfaces there and neither here. Name the roles.
revoke execute on function public.enforce_owner_authority() from public, anon, authenticated;
revoke execute on function public.enforce_organization_has_owner() from public, anon, authenticated;
