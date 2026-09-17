-- SPEC-007 REQ-1 / AC-8 — the first policy in this repository that reads an entitlement.
--
-- Until now `is_org_entitled` existed, was proven, and gated nothing: no policy called it. This is
-- the change that makes "the database entitles" (ADR-006) a fact about a request rather than a
-- function somebody could call. It is the same shape as membership, deliberately -- after this,
-- "is this request inside its plan" is answered the way "is this caller a member" is answered, by a
-- policy, on every request.
--
-- **INSERT only, decided by the owner 2026-09-17.** The other three commands were considered and
-- refused, and the reasons are here rather than in a commit message because the next person to widen
-- this clause will read the policy, not the history:
--
--   SELECT gated -> an organization's existing projects vanish when a subscription lapses. Data
--                   disappearing on billing state is not a downgrade, it is a hostage.
--   UPDATE gated -> they cannot rename or fix what they already own.
--   DELETE gated -> they cannot clean up after themselves. A lapsed org would be stuck.
--   INSERT only  -> keep what you have; you cannot add more. The standard downgrade semantic, and
--                   the narrowest gate that expresses the decision -- which is the direction REQ-7
--                   already chose when it decided this system errs toward GRANTING.
--
-- ALTER rather than drop-and-recreate: it changes the one clause and leaves no window, however
-- brief, in which the table has no INSERT policy at all.
--
-- INSERT is also the only one of the four commands with a WITH CHECK and no USING, so this adds one
-- conjunct to one expression and there is no read-path clause to get wrong.
--
-- Membership is KEPT, not replaced. `is_org_entitled` re-checks membership internally, so the two
-- overlap -- but relying on that would make the isolation guarantee a side effect of the billing
-- helper's implementation. If someone later simplifies the entitlement function, tenant isolation
-- must not be what breaks.
alter policy project_insert on public.project
  with check (
    public.is_org_member(organization_id)
    and public.is_org_entitled(organization_id)
  );

comment on policy project_insert on public.project is
  'SPEC-007 AC-8: a member of an ENTITLED organization may create a project. Unentitled orgs keep '
  'full SELECT/UPDATE/DELETE on what they already have -- INSERT is the only gated command, and '
  '007-entitlement.test.sql asserts the other three stay permitted so that is a property rather '
  'than an omission.';
