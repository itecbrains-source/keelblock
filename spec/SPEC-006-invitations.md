# SPEC-006: Invitations

> Status: `done` · Bars: **B-2** · Research: [`research/09-INVITATION-BOUNDARY.md`](../research/09-INVITATION-BOUNDARY.md) · ADRs: [001](../docs/adr/ADR-001-tenancy-model.md), [002](../docs/adr/ADR-002-auth.md), [011](../docs/adr/ADR-011-app-router-conventions.md)
> Contracts: SPEC-001, SPEC-002, SPEC-004, SPEC-005 ·

## Intent

Get a second person into an organization, and get them out again.

Two things make this more than plumbing. **It is the first row that must be readable by somebody who
is not a member** — every policy in the schema denies exactly that, deliberately, so the exception
has to be taken somewhere and described. And it is the first surface where **revocation can be
walked**: memo 08 argued that keelblock reads membership per request rather than caching it in a
token, so a removed admin loses access immediately rather than at token expiry. Until there is a
revocation to perform, that is an argument.

## Scope / non-scope

- **In scope:** inviting by email with a role · a preview a stranger can read with the token alone ·
  accepting · declining · revoking · the admin's list of pending invitations · role change on an
  existing member · the journey tests that walk acceptance and revocation.
- **Out of scope, and named so each is a decision:**
  - **Sending the email.** The invitation row and its token are created here; delivery is SPEC-017's
    transactional email. Until then the link is surfaced to the inviter to pass on, which is honest
    about what exists rather than pretending mail is wired.
  - **Bulk invitations, domain auto-join, SSO provisioning** — SPEC-009's enterprise identity
    territory (DEF-005), and each changes the trust model rather than extending it.
  - **The role model and the last-owner invariants** — SPEC-001 (REQ-7, F-9, F-10). Acceptance and
    revocation must not be able to violate them, and that is asserted rather than re-implemented.
  - **Rate limiting the preview endpoint** — nothing in keelblock is rate limited (DEF-006), and
    inventing it for one endpoint would be worse than the honest gap.

## Sources of truth

- `docs/PRODUCT.md`
- `research/09-INVITATION-BOUNDARY.md`
- `research/08-ORG-CONTEXT.md` — why revocation is immediate at all
- `supabase/migrations/20260907120000_tenancy_foundation.sql` — REQ-11's rule for definer functions
- `supabase/migrations/20260907150000_membership_invariants.sql` — owner authority, last-owner succession
- `src/lib/orgs/dal.ts` — where organization reads already happen

## Requirements

### REQ-1 — no policy admits a stranger; one function does

The invitation table's policies admit only admins of the owning organization, exactly like every
other tenant table. A stranger reads an invitation through a single `SECURITY DEFINER` function that
takes the token.

The alternative — `to anon using (true)` plus an application-side token filter — is refused with the
reason in the memo: it is F-15's shape, with the row in memory before anything decides the caller was
entitled to it. A policy also cannot be parameterised by a request value a browser client can set,
so the token-in-the-policy version is not expressible.

### REQ-2 — the function's return shape IS the boundary, and is stated

`invitation_preview(token)` returns **the organization's name and the invited role**. Not the
organization id, not the inviter, not the invitee's email, not whether other invitations exist.

SPEC-001 REQ-11 constrains definer functions to scalar returns precisely because a row-returning one
is an isolation bypass nobody can see. This is the first that must return more than a boolean, so
the widening is deliberate, minimal, and asserted by a test rather than left to review.

### REQ-3 — the token is random, stored hashed, and single-use

The row holds `sha256(token)`; the plaintext exists only in the link. A leaked invitation table is
therefore not a set of working invitations.

Acceptance is **one statement** — the membership is granted and `accepted_at` set in the same
`where accepted_at is null` — so two simultaneous accepts cannot both succeed. Check-then-act across
two statements is the classic version of this bug and it is a race in production, not in theory.

### REQ-4 — a spent, revoked or expired token is indistinguishable from an invented one

All four answer the same way: not found. Not "already accepted", which tells a stranger their guess
was once valid, and not "expired", which confirms the organization exists.

Lifetime is **seven days**, and the memo says plainly that this is a judgment with no evidence behind
it. It is here so it can be argued with rather than discovered in a constant.

### REQ-5 — accepting requires a session, and grants exactly the invited role

The invitee signs in first — the invitation names an email, and acceptance binds the membership to
`auth.uid()`, not to the email in the row. An invitation is a capability to join, not an identity
claim: someone signed in as another address may still redeem a token they were sent, and the row
records who actually accepted.

### REQ-6 — revoking is immediate, and that is a journey test

Revoking a pending invitation makes the token not-found. Removing a member ends their access on their
**next request** — no token refresh, no sign-out, no waiting for expiry.

This is the competitive claim from memo 08, and it is walked in a browser rather than asserted:
an admin is removed while signed in, and their next navigation is refused. What it does not prove is
also written down — their access token stays valid until it expires; what changes is that nothing in
this system consults it for authorization.

### REQ-7 — the invariants hold through acceptance and revocation

An invitation cannot mint an owner where a trigger would refuse one, cannot be used to demote an
owner, and cannot leave an organization without one. Those are SPEC-001's triggers; this spec asserts
they still hold on the new paths rather than restating them.

## Acceptance criteria

| AC   | Verifies | Method | Evidence                                                                                                                                                                                                                                                                                           | Status   |
| ---- | -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-1 | REQ-1    | test   | `supabase/tests/intent/006-invitations.test.sql` — no policy admits a stranger, and the generated suite now probes this table across the command matrix (`scripts/check-policies.mjs`); a direct self-insert into `organization_member` is refused `42501`, so the invitation path is not optional | **done** |
| AC-2 | REQ-2    | test   | `supabase/tests/intent/006-invitations.test.sql` — the preview returns the organization name and the role; the composite type's attributes are asserted from `pg_attribute`, so adding a column to it fails here                                                                                   | **done** |
| AC-3 | REQ-3    | test   | `supabase/tests/intent/006-invitations.test.sql` — the plaintext token matches no row, and the sha256 of it matches exactly one                                                                                                                                                                    | **done** |
| AC-4 | REQ-3    | test   | `e2e/journeys/invitation.spec.ts` — two real clients race for one token with `Promise.all`; exactly one succeeds, one is refused, and the organization gains exactly one member                                                                                                                    | **done** |
| AC-5 | REQ-4    | test   | `supabase/tests/intent/006-invitations.test.sql` — an invented token, a spent one and a revoked one all return zero rows from the same call                                                                                                                                                        | **done** |
| AC-6 | REQ-5    | test   | `supabase/tests/intent/006-invitations.test.sql` — acceptance binds to `auth.uid()` and grants the stored role; the caller supplies only a token, so there is no role parameter to tamper with                                                                                                     | **done** |
| AC-7 | REQ-6    | test   | `e2e/journeys/invitation.spec.ts` — minted in Alice's browser, opened in a second browser with no session, signed in, accepted, and replayed to prove the link is spent                                                                                                                            | **done** |
| AC-8 | REQ-6    | test   | `e2e/journeys/invitation.spec.ts` — Bob is signed in and looking at Acme, Alice removes him through her own screen, and his next request shows nothing; mutation-proven (skipping the removal fails the test)                                                                                      | **done** |
| AC-9 | REQ-7    | test   | `supabase/tests/intent/006-invitations.test.sql` — an `owner` invitation is refused where it is CREATED: it was mintable and unacceptable, and permitting acceptance would have routed an admin to ownership past the trigger that forbids it                                                      | **done** |

## Definition of Done

- [ ] Every REQ `done` with its AC passing, or covered by an open `DEF-*` with a machine-evaluable trigger.
- [ ] Cheap gates green: `npm run check`, and the journey layer green in CI.
- [ ] The access matrix regenerated and its diff read. The new table must show **no access** for
      `Authenticated · different organization` — the exception is the function, not a policy — and any
      anomaly adjudicated in `keelblock.access-allowances.json` with a reason of substance.
- [ ] **Validation note:** the revocation walk performed in a browser, not in `pgTAP`. It is the
      claim memo 08 makes, and a database test cannot show that a signed-in person stops being served.

## Deferrals

None yet. Email delivery is out of scope by decision (SPEC-017), not deferred work.
