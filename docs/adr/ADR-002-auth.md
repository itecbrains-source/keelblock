# ADR-002: Authentication — Supabase Auth

**Status:** Accepted · **Date:** 2026-09-07 · **Deciders:** owner

## Context

The auth choice determines whether keel's central claim needs an asterisk. Supabase RLS policies key
off `auth.uid()`, read from a Supabase-issued JWT. Any auth system that does not issue that JWT
requires a bridge before RLS can enforce anything.

The field has moved: MakerKit switched to **Better Auth**, whose organization plugin ships
organisations, members, invitations and RBAC as generated schema, server APIs and a client SDK.
Independent comparisons call this the strongest reason to choose it for B2B — and note that Supabase
"leaves tenancy to your app (or a kit)."

## Decision Drivers

- The claim in `PRODUCT.md` must be true without qualification.
- Time to parity matters, but not more than the claim.
- Fewer moving parts between the session and the policy means fewer places for isolation to fail.

## Options Considered

### Option A: Supabase Auth

| Pros                                                                | Cons                                                                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `auth.uid()` works in policies with nothing in between              | Organisations, members, invitations, RBAC are all keel's to build — a large share of v1 |
| One vendor for auth + data + policies; local stack covers all of it | Tied to Supabase (which is already a stated premise, not a new cost)                    |
| Magic link, OAuth, MFA already solved                               |                                                                                         |

### Option B: Better Auth

| Pros                                                  | Cons                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Organization plugin delivers a large slice of v1 free | Owns users in your Postgres and issues its own session — RLS integration is a bridge keel builds and must prove |
| TypeScript-native, no vendor service                  | The bridge is exactly the surface where isolation quietly breaks, in the one area keel claims to be best at     |

### Option C: Supabase Auth behind a swap seam

| Pros                        | Cons                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| Keeps Better Auth swappable | An unexercised seam rots; abstracting auth "just in case" reliably produces the worst of both |

## Decision

**Chosen: Option A — Supabase Auth**, no abstraction seam.

The cost is accepted with open eyes: keel writes the organisation, membership, invitation and role
model itself. That work is not wasted — it is precisely the part that must be RLS-enforced and
proven, and inheriting it from a plugin would mean inheriting a model that was not designed for
policy enforcement.

## Consequences

**Positive:** no bridge; `auth.uid()` is available in every policy; one local stack runs auth, data
and policies together, so tests exercise the real path.

**Negative:** more of v1 is keel's to build, and the invitation flow in particular (accept, decline,
join, role change, revoke) is fiddly and security-sensitive. Mitigated by making it a SPEC of its own
with adversarial intent tests, rather than a sub-section of a larger one.
