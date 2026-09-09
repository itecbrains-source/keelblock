# ADR-002: Authentication — Supabase Auth

**Status:** Accepted · **Date:** 2026-09-07 · **Deciders:** owner

## Context

The auth choice determines whether keelblock's central claim needs an asterisk. Supabase RLS policies key
off `auth.uid()`, read from a Supabase-issued JWT. Any auth system that does not issue that JWT
requires a bridge before RLS can enforce anything.

The field has moved: MakerKit switched to **Better Auth**, whose organization plugin ships
organizations, members, invitations and RBAC as generated schema, server APIs and a client SDK.
Independent comparisons call this the strongest reason to choose it for B2B — and note that Supabase
"leaves tenancy to your app (or a kit)."

## Decision Drivers

- The claim in `PRODUCT.md` must be true without qualification.
- Time to parity matters, but not more than the claim.
- Fewer moving parts between the session and the policy means fewer places for isolation to fail.

## Options Considered

### Option A: Supabase Auth

| Pros                                                                | Cons                                                                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `auth.uid()` works in policies with nothing in between              | Organizations, members, invitations, RBAC are all keelblock's to build — a large share of v1 |
| One vendor for auth + data + policies; local stack covers all of it | Tied to Supabase (which is already a stated premise, not a new cost)                         |
| Magic link, OAuth, MFA already solved                               |                                                                                              |

### Option B: Better Auth

| Pros                                                  | Cons                                                                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Organization plugin delivers a large slice of v1 free | Owns users in your Postgres and issues its own session — RLS integration is a bridge keelblock builds and must prove |
| TypeScript-native, no vendor service                  | The bridge is exactly the surface where isolation quietly breaks, in the one area keelblock claims to be best at     |

### Option C: Supabase Auth behind a swap seam

| Pros                        | Cons                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| Keeps Better Auth swappable | An unexercised seam rots; abstracting auth "just in case" reliably produces the worst of both |

## Decision

**Chosen: Option A — Supabase Auth**, no abstraction seam.

The cost is accepted with open eyes: keelblock writes the organization, membership, invitation and role
model itself. That work is not wasted — it is precisely the part that must be RLS-enforced and
proven, and inheriting it from a plugin would mean inheriting a model that was not designed for
policy enforcement.

## Consequences

**Positive:** no bridge; `auth.uid()` is available in every policy; one local stack runs auth, data
and policies together, so tests exercise the real path.

**Negative:** more of v1 is keelblock's to build, and the invitation flow in particular (accept, decline,
join, role change, revoke) is fiddly and security-sensitive. Mitigated by making it a SPEC of its own
with adversarial intent tests, rather than a sub-section of a larger one.

## Addendum, 2026-09-09 — what shape an SSO integration has to take

This ADR's whole argument is one property: policies key off `auth.uid()` from a **Supabase-issued**
JWT, so keelblock's claim needs no bridge and no asterisk (D-2). It says why that mattered when
choosing between auth systems. It does not say what it demands of the first SSO integration somebody
adds, and that is the decision this addendum makes before there is code to argue about.

**The constraint.** An SSO integration preserves the property only if it sits **upstream** of
Supabase, so that Supabase still mints the session. Enterprise IdP → SSO service → Supabase → JWT →
`auth.uid()`. Every policy in the repository, and every pgTAP test that sets
`request.jwt.claim.sub`, keeps working untouched, because nothing about the token has changed.

**The shape that destroys it, and how close to hand it is.** Wire an auth service _beside_ Supabase
instead and the database stops reading a Supabase token. Supabase's own third-party auth documents
this plainly — "the API will trust JWTs issued by the provider similar to how it trusts JWTs issued
by Supabase Auth" — and `supabase/config.toml` already carries four commented-out
`[auth.third_party.*]` sections for exactly that. So the wrong shape is one uncomment away, it would
be a perfectly reasonable-looking change, **and nothing in this repository would notice**: the
policies still compile, the tests still pass with the claims they set themselves, and the property
D-2 bought is simply gone.

**What satisfies the constraint** (verified from Supabase's own documentation, 2026-09-09):

- **An upstream OIDC provider, registered as a custom provider.** You supply "the `issuer` URL and
  the discovery document, JWKS, and endpoints are resolved automatically". Available on every tier —
  "Free plan projects can add up to 3 custom providers. Pro plan and above have unlimited custom
  providers" — so the shape that keeps the property is also the one that is not paywalled. Any
  SAML-to-OIDC bridge can occupy that slot; none is named here, and none is a dependency of this
  project.
- **Supabase's own SAML SSO** preserves it too, and is the obvious answer, with a caveat this project
  has to take seriously: "SAML 2.0 support is offered on plans Pro and above", and it cannot be
  exercised on the stack this repository runs. Measured, not read — there is no SAML or SSO
  environment variable on the local auth container, no `[auth.saml]` key in the pinned CLI, and no
  such section in `config.toml`. Something that can never run in `check` or in CI is the unexercised
  seam this ADR refuses in its own Context.

**This ships nothing.** No dependency is added, no SSO is built, and DEF-005 stays open on a blocker
that has not moved. It is recorded now for the reason ADR-006's addendum was: it is a constraint on
work that has not happened yet, and a constraint like that gets **discovered** rather than **decided**
if it waits for the change that violates it. It also answers a buyer's "can I add SSO?" — yes,
upstream, and here is the line not to cross — without this repository carrying the integration.
