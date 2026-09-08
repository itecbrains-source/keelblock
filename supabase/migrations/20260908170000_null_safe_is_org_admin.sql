-- `is_org_admin` returned NULL for a non-member, and NULL is not false.
--
-- MEASURED on a clean stack, 2026-09-08, for a caller who belongs to no organization:
--
--     is_org_member  -> false
--     is_org_admin   -> NULL
--
-- Two sibling helpers, the same name shape, different answers to the same question. `is_org_member`
-- is built on `exists`, which is never null; `is_org_admin` was `org_role_of(org) in ('owner',
-- 'admin')`, and `org_role_of` returns NULL for a non-member, so the whole expression is NULL.
--
-- Nothing caught it for two reasons, and both are worth stating because they are the general shape.
-- First, in a policy `USING` clause Postgres treats NULL as a refusal, so every existing policy
-- behaved correctly and no isolation test could have seen this. Second, the generated prober MOCKS
-- these helpers to `SELECT true` / `SELECT false` to isolate the wiring -- it proves the policy
-- consults the helper, and by construction can never observe what the real one returns.
--
-- It surfaces the moment the helper is used in PROCEDURAL code, which SPEC-006 is the first to do:
--
--     if not public.is_org_admin(org) then raise insufficient_privilege; end if;
--
-- `not NULL` is NULL, `if NULL then` does not branch, and the guard falls through in silence. The
-- authoring test caught it -- `invite_member` minted an invitation into an organization the caller
-- had no membership in at all, with no exception -- which is the whole argument for writing the
-- assertion before the function.
--
-- The repair belongs in the helper, not in the caller. A caller-side `coalesce(..., false)` fixes
-- one site and leaves the trap armed for the next person, and the next person has every reason to
-- trust a boolean-returning function named `is_...`.
create or replace function public.is_org_admin(org uuid)
returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
  select coalesce(public.org_role_of(org) in ('owner', 'admin'), false);
$$;

-- `create or replace` preserves the existing grants; restated so a reader of this file alone can
-- see that the function is not callable by `anon`, rather than inferring it from another migration.
revoke execute on function public.is_org_admin(uuid) from public, anon;
grant  execute on function public.is_org_admin(uuid) to authenticated;
