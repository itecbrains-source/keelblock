-- Two gaps the access matrix could not fail on until 2026-09-08, when it was first made able to
-- (F-26). Both are the same shape: a hardening rule applied to the objects that existed when it was
-- written, and not to the ones added afterwards.
--
-- 1 · EXECUTE-to-PUBLIC on the two trigger functions.
--
--    20260907120000 REQ-11 records the rule -- "Postgres grants EXECUTE on new functions to PUBLIC"
--    -- and revokes it for is_org_member, org_role_of and is_org_admin. The two trigger functions
--    added later in 20260907150000 kept the default, so `anon` holds EXECUTE on two SECURITY DEFINER
--    functions that read and write organization_member.
--
--    MEASURED before writing this, on a live local stack:
--      set role anon; select public.enforce_owner_authority();
--      ERROR:  trigger functions can only be called as triggers
--    So it is NOT exploitable: Postgres refuses a direct call to a function returning `trigger`,
--    whoever holds EXECUTE. Stated plainly because the honest severity matters -- this is defense in
--    depth and consistency with a rule the repository already made, not a live hole.
--
-- 2 · service_role still holds the destructive defaults.
--
--    20260907130000 revoked TRUNCATE, REFERENCES and TRIGGER from anon and authenticated after
--    measuring that `set role anon; truncate public.organization cascade;` succeeded. service_role
--    was not included.
--
--    MEASURED: on all three tenant tables service_role holds exactly REFERENCES, TRIGGER, TRUNCATE
--    and NO DML -- so today the sanctioned bypass role can destroy a table's contents and cannot read
--    a row of it. RLS does not apply to TRUNCATE at all, so no policy limits this.
--
--    Exploitability, honestly: service_role is server-only and never in a browser, so this is not
--    remote. It is blast radius -- a leaked service key currently means total data loss rather than a
--    scoped read, which is the wrong way round. Removing it costs nothing, because nothing holds the
--    DML that would make the role useful for anything else yet.

revoke execute on function public.enforce_owner_authority() from public;
revoke execute on function public.enforce_organization_has_owner() from public;

revoke truncate, references, trigger on all tables in schema public from service_role;

-- and for tables created later, so a new table does not silently reintroduce it
alter default privileges in schema public
  revoke truncate, references, trigger on tables from service_role;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from service_role;
