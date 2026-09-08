# SPEC-005: Organizations and roles

> Status: `done` · Bars: **B-2** · Research: [`research/08-ORG-CONTEXT.md`](../research/08-ORG-CONTEXT.md) · ADRs: [001](../docs/adr/ADR-001-tenancy-model.md), [002](../docs/adr/ADR-002-auth.md), [011](../docs/adr/ADR-011-app-router-conventions.md)
> Contracts: SPEC-001, SPEC-002, SPEC-004, SPEC-006 ·

## Intent

Make the claim visible. SPEC-001 proved tenant isolation over a fixture and SPEC-004 gave the
database a caller; a person who signs in still cannot see an organization, because no screen renders
one. Until an organization can be created, switched and administered through the product, keelblock's
central claim is something you demonstrate in `pgTAP` and cannot show anyone.

This is also the spec that unblocks four of SPEC-004's acceptance criteria, which name their blocker
in their own evidence column: _needs a protected route (SPEC-005)_. There is now a route to protect.

## Scope / non-scope

- **In scope:** creating an organization · listing the ones you belong to · selecting an active one
  and having every surface honor it · a members list showing who holds which role · changing a
  member's role and removing a member, both authorized · the first authenticated route, and the
  Data Access Layer functions behind it.
- **Out of scope, and named so each is a decision:**
  - **Invitations** — SPEC-006. This spec administers people who are already members; getting them
    there is the fiddly, security-sensitive half and ADR-002 already separated it deliberately.
  - **Organization settings beyond name and slug** — SPEC-008. Nothing here needs a settings surface
    to prove the claim.
  - **The role model, the last-owner invariants, and the creation RPC** — all built in SPEC-001
    (REQ-7, F-9, F-10). This spec consumes them and must not rebuild them; a second definition of
    who may demote an owner is how the first one stops being true.
  - **A JWT claim carrying role or organization** — refused with a reason, see REQ-2.

## Sources of truth

- `docs/PRODUCT.md`
- `docs/adr/ADR-001-tenancy-model.md`
- `research/08-ORG-CONTEXT.md`
- `supabase/migrations/20260907120000_tenancy_foundation.sql` — the policies and membership helpers
- `supabase/migrations/20260907140000_organization_creation_rpc.sql` — `create_organization`
- `supabase/migrations/20260907150000_membership_invariants.sql` — owner authority, last-owner succession
- `src/lib/auth/dal.ts` — where authorization happens (SPEC-004 REQ-1)

## Requirements

### REQ-1 — the active organization is a view selection, never a security boundary

Every read stays membership-scoped in the policy. The selected organization is a filter the
application adds, exactly as Supabase's own performance guidance recommends independently
("add explicit filters in your application queries alongside RLS checks", measured there at
171ms → 9ms).

The consequence is the point: **a forged, stale or simply wrong active organization returns the wrong
rows only if the caller is a member of that organization too, and returns nothing otherwise.** The
boundary does not move when the switcher is wrong.

Stated as a requirement because the opposite is the natural assumption. A reader who believes the
switcher enforces anything will eventually make it the only thing that does.

### REQ-2 — no organization or role claim in the JWT

Refused deliberately, and the reason is arithmetic rather than taste. An access token lives up to
`jwt_expiry`, which is `3600` here, so a claim is a photograph of the database taken up to an hour
ago. **Revoke an admin and they remain an admin until their token turns over.**

Supabase's own RBAC guide reaches for a custom access token hook and never mentions this; the
research memo went looking for the warning and found none on either page. A project claiming
provable isolation cannot hold a credential that lies for an hour about who is an admin.

Revisit only with a measurement showing the per-request lookup is the bottleneck.

### REQ-3 — creating an organization goes through the existing RPC, and the creator owns it

`create_organization(org_name, org_slug)` already exists, is `SECURITY DEFINER` with a pinned
`search_path`, revoked from `anon`, and makes the creator an owner atomically. The surface calls it.
It does not insert into `organization` directly — the direct INSERT grant was revoked
(`20260908130000`) precisely so creation has one path with the validation in it.

### REQ-4 — the active organization is validated on every request

Not because isolation depends on it — REQ-1 says it does not — but because rendering one
organization's name above another's rows is a correctness failure, and an alarming one to look at.

The value arrives from a cookie. It is validated against the caller's memberships in the Data Access
Layer on every request, and an unknown, forged or no-longer-permitted value falls back to a
membership the caller actually holds rather than erroring.

### REQ-5 — a members list shows who holds which role

The first surface where isolation is observable rather than asserted: two accounts, two
organizations, and a members list that shows exactly one of them. This is what makes the claim
demonstrable to someone who will not read `pgTAP`.

### REQ-6 — changing a role and removing a member are authorized, and the invariants already hold

Both are administrative actions gated on `is_org_admin`, and both are Server Actions, so both
re-verify their caller (SPEC-004 REQ-3) rather than trusting the page that rendered the button.

What must NOT be rebuilt: an admin cannot demote or remove an owner, and the last owner cannot leave.
Those are triggers from SPEC-001 (F-9, F-10) and they hold regardless of what any surface does. This
spec's tests assert the surface reports the refusal honestly rather than presenting it as success.

### REQ-7 — the first authenticated route exists, and refuses on its own

`/[locale]/orgs` requires a session, obtained through the Data Access Layer, in the route's own data
path. Not in the proxy — a matcher change or a moved Server Function removes that coverage silently
(SPEC-004 REQ-1, and GHSA-f82v-jwr5-mffw is what it costs when it is the only check).

It is also the artifact four of SPEC-004's criteria have been waiting for: with a protected route in
existence, AC-1, AC-2, AC-7 and AC-8 become writable and are closed in the same change.

**Stated precisely, because measuring it corrected the obvious wording.** Under Cache Components
(ADR-004) a route's shell is prerendered and flushed before any session-dependent code runs, so a
`redirect()` in the streamed region becomes a client-side navigation and the status stays `200`.
Four approaches were tried — the check at the top level, the check inside `<Suspense>`,
`dynamic = 'force-dynamic'` (refused outright by `cacheComponents`), and `connection()` — and none
produced an HTTP redirect.

So the property this REQ actually holds, and the only one it claims, is: **no tenant data reaches an
unauthenticated caller.** Verified — zero organization names, zero member rows, zero identifiers.
What a stranger receives is page chrome and a client-side redirect to sign in. That is a weaker
statement than "the route refuses" and it is the true one; the difference is recorded as
[F-38](../docs/FINDINGS.md).

## Acceptance criteria

| AC   | Verifies | Method | Evidence                                                                                                                                                                                                       | Status   |
| ---- | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-1 | REQ-1    | test   | `supabase/tests/intent/005-organizations.test.sql` — a member of two organizations reads each in turn, and with NO filter sees their own two and not the third                                                 | **done** |
| AC-2 | REQ-1    | test   | `supabase/tests/intent/005-organizations.test.sql` — naming an organization the caller does not belong to yields nothing, not even its name                                                                    | **done** |
| AC-3 | REQ-2    | test   | `supabase/tests/intent/005-organizations.test.sql` — no policy on the three tables reads `jwt` in its USING or WITH CHECK                                                                                      | **done** |
| AC-4 | REQ-3    | test   | `supabase/tests/intent/005-organizations.test.sql` — a direct INSERT is refused `42501`; `supabase/tests/intent/002-organization-creation.test.sql` covers the RPC granting ownership                          | **done** |
| AC-5 | REQ-4    | test   | `src/lib/orgs/active-org.test.mts` — absent, unknown, revoked and forged values all fall back, with the invariant stated once                                                                                  | **done** |
| AC-6 | REQ-5    | test   | `src/app/[locale]/orgs/members-list.dom.test.tsx` — renders exactly the members given; a member sees no administration controls                                                                                | **done** |
| AC-7 | REQ-6    | test   | `supabase/tests/intent/005-organizations.test.sql` — a member's role change changes nothing; `supabase/tests/intent/003-membership-invariants.test.sql` — an admin cannot demote the owner                     | **done** |
| AC-8 | REQ-6    | test   | `supabase/tests/intent/003-membership-invariants.test.sql` — the last owner cannot leave; `src/app/[locale]/orgs/members-list.dom.test.tsx` — the surface has an alert region so a refusal cannot be swallowed | **done** |
| AC-9 | REQ-7    | test   | `src/app/[locale]/orgs/route-protection.test.mts` — the refusal is in the route's data path, not the proxy; and no tenant data reaches an unauthenticated caller (measured, see §Verification)                 | **done** |

## Definition of Done

- [ ] Every REQ `done` with its AC passing, or covered by an open `DEF-*` with a machine-evaluable trigger.
- [ ] Cheap gates green: `npm run check`.
- [ ] The access matrix regenerated and its diff read. **A tick in the "different organization" column is a tenant leak caught in a document**, and any new anomaly is adjudicated in `keelblock.access-allowances.json` with a reason of substance.
- [ ] SPEC-004's four criteria that name "needs a protected route" are closed in this change, not left open after their blocker landed.
- [ ] The research memo re-verified on the date of build.
- [ ] **Validation note:** two real accounts, two organizations, driven in a browser — one signed-in user cannot see the other's project. Not `pgTAP`. The claim is demonstrable or it is not made.

## Deferrals

None. Invitations and settings are out of scope by decision rather than deferred, and the role model
this spec needs already exists.

## Verification record

**Two accounts, two organizations, through the running application**, 2026-09-08. This is the
demonstration the spec exists for — the claim shown rather than asserted in `pgTAP`.

```
1 · both signed in, callback landed at /orgs
2 · organizations created through the RPC:      ok
3 · Alice reads: [ 'Alice secret plan' ]
    Bob reads:   [ 'Bob secret plan' ]
4 · Alice's /orgs shows "Acme": true  ·  shows "Beta": false
5 · Alice with BOB'S organization id in her cookie sees "Beta": false
6 · unauthenticated /orgs: 200, page chrome only — zero organization names,
    zero member rows, zero identifiers; client-side redirect to sign in

VERDICT: no cross-tenant read, and a forged organization cookie changes nothing
```

Line 5 is the one worth keeping. It is the whole argument of REQ-1 executed against the real app: an
attacker-controlled active organization is not a boundary because it was never asked to be one, and
setting it to somebody else's organization returns nothing.

Line 6 is the honest one. It is not the redirect the requirement originally implied, and the
difference is [F-38](../docs/FINDINGS.md).
