# How the organization context reaches a policy — and what a switcher is allowed to be

_Researched 2026-09-08, before SPEC-005 was written. **The load-bearing question is not how to build
an organization switcher; it is whether the switcher is a security boundary.** The answer decides the
schema, and getting it wrong is not visible in any test that only checks the happy path._

## The question

SPEC-001 built membership-scoped policies:

```sql
create policy project_select on public.project
  for select to authenticated using (public.is_org_member(organization_id));
```

That answers _may this caller see this row at all_. It does not answer _which organization is the
caller currently looking at_, and a user in three organizations needs both. Three ways to supply the
second, and they are not interchangeable.

## Option A — a claim in the JWT

Supabase's own RBAC guide reaches for this: a **custom access token hook**, which "runs before a
token is issued and allows you to add additional claims", and policies then read
`auth.jwt() ->> 'user_role'`.

**It is the fastest to evaluate and the most dangerous to rely on, for one reason the guide never
mentions.** A claim is a photograph of the database taken when the token was issued. From the
sessions documentation: access tokens "are designed to be short lived, usually between 5 minutes and
1 hour"; this repository's `jwt_expiry` is `3600`. So:

- Revoke an admin's role and **they remain an admin for up to an hour**, because their token still
  says so.
- Switching organization means minting a new token, not setting a value.
- Removing someone from an organization does not remove their access until their token expires.

Searched for a warning about this in Supabase's RBAC guide and the custom-access-token-hook page and
**found none** — neither page states what a user must do after a role change for the new claim to
take effect. That silence is the most useful thing this research turned up, because the pattern reads
as the vendor-recommended default and its expiry window is invisible in every example.

**Contested, and labeled as such:** a hook-based claim is defensible when the claim is genuinely
immutable for the session's lifetime. A role is not that. An organization _selection_ arguably is —
but only if you accept that leaving an organization does not take effect until the token turns over.

## Option B — a session variable

`set_config('app.current_org', …, true)` and read it with `current_setting()` in the policy.

Ruled out on mechanics rather than taste. Transaction-scoped `SET LOCAL` is the only safe form,
because a connection-scoped one **leaks to whoever gets that pooled connection next** — a
cross-tenant read produced by pooling, which no policy would catch. And PostgREST gives a browser
client no way to issue it: reaching this from the app means wrapping every read in an RPC that sets
the value first, which is a second data-access path built alongside the one this project already has.

## Option C — membership in the policy, organization as an application filter

The policy asks the database, per request, whether the caller is a member. The _selected_
organization is a filter the application adds to its queries:

```sql
using (public.is_org_member(organization_id))     -- the boundary: always current, never cached
```

```ts
.eq('organization_id', activeOrg)                  -- the view: which org am I looking at
```

This is what SPEC-001 already built, and the research says keep it — with a specific, quotable
reason from Supabase's own performance guidance, which recommends the same shape for a different
motive:

> **Avoid RLS for filtering** — "add explicit filters in your application queries alongside RLS
> checks", measured there at 171ms → 9ms.

So the app-side filter is not a workaround for a weak policy. It is what the vendor recommends
independently, and it happens to make the switcher harmless: **a forged, stale or simply wrong active
organization returns the wrong rows only if you are a member of that organization too, and returns
nothing otherwise.** The boundary never moves.

The costs are real and are mitigated in ways already present here:

| Cost                                   | Mitigation, and whether it exists                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A function call per row                | `(select auth.uid())` inside the helper forces one `initPlan` evaluation — measured by Supabase at 179ms → 9ms, and up to 178,000ms → 12ms. **Already done** (SPEC-001 REQ-5). |
| A lookup against `organization_member` | Indexed both ways; the vendor measures indexing an RLS column at over 100×, 171ms → <0.1ms. **Already done.**                                                                  |
| Cascading policy evaluation on joins   | `SECURITY DEFINER` helper bypasses RLS on the joined table — measured at 9,000ms → 20ms. **Already done**, and REQ-11 constrains it to scalar returns.                         |

## What this memo changes about the spec

1. **The active organization is not a security boundary, and the spec must say so where someone
   would otherwise assume it.** It is a view selection. Every read remains membership-scoped whether
   or not the switcher is correct.
2. **No custom access token hook, and no claim carrying role or organization.** Revocation must be
   immediate; a token that lies for an hour about who is an admin is not something this project can
   claim isolation on.
3. **The switcher's value must still be validated on every request** — not because isolation depends
   on it, but because rendering "Acme" while showing another organization's rows is a correctness
   failure and an alarming one.
4. **The role model, the last-owner invariants and the creation RPC already exist** (SPEC-001
   REQ-7, F-9, F-10) and must not be rebuilt. SPEC-005 is surfaces and one authorization question:
   who may change whose role.

## Settled / contested

**Settled**, and safe to build on: membership-in-policy with an app-side filter, and every
performance mitigation for it, all from the vendor's own guidance · transaction-scoped session
variables are the only safe form and are unreachable from a browser client · access tokens live
between five minutes and an hour, and `jwt_expiry` here is 3600.

**Contested, and to be labeled where it appears:** whether a JWT claim is ever the right home for an
organization selection. It is defensible for immutable facts and this project has none. Revisit only
with a measurement showing the per-request lookup is actually the bottleneck — not before.

**Unmeasured here:** the per-request lookup's cost on this schema at realistic row counts. Every
figure above is Supabase's, on their fixtures. The honest position is that the mitigations are in
place and the number has not been taken; SPEC-005 should not claim a performance property it has not
measured.

## Sources

**Primary** — the vendor's own documentation, and this repository's own migrations:

- [Supabase — Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook) · what the hook does, and the absence of any staleness warning
- [Supabase — Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) · the `authorize()` pattern reading `auth.jwt() ->> 'user_role'`, and again no statement about what a role change requires
- [Supabase — User sessions](https://supabase.com/docs/guides/auth/sessions) · access tokens "designed to be short lived, usually between 5 minutes and 1 hour"; refresh tokens single-use
- [Supabase — RLS performance and best practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv) · index RLS columns (>100×), wrap functions in `select` (179ms → 9ms), **avoid RLS for filtering** (171ms → 9ms), security-definer functions on joins (9,000ms → 20ms), specify `to authenticated`
- `supabase/migrations/20260907120000_tenancy_foundation.sql` · the membership helpers, their pinned `search_path`, and the scalar-return rule
- `supabase/migrations/20260907150000_membership_invariants.sql` · owner authority and last-owner succession, already enforced as triggers

**Secondary** — used to orient, not relied upon for any claim:

- [Supabase — JWT fields reference](https://supabase.com/docs/guides/auth/jwt-fields) · read to confirm which claims exist by default; nothing here rests on it

## The version note this memo will go stale on

Verified against Supabase's documentation as of 2026-09-08 and this repository's `jwt_expiry = 3600`.
The staleness argument in Option A is arithmetic on that number: **raise `jwt_expiry` and the window
in which a revoked admin keeps their access grows with it.** If a future session shortens token
lifetime substantially, Option A becomes worth re-examining — and that is the one change that should
send someone back to this page.
