# ADR-001: Tenancy model — `organization` as the root entity, membership as the boundary

**Status:** Accepted · **Date:** 2026-09-07 · **Deciders:** owner, architect

## Context

The root tenant entity's name and shape propagate into every table, policy, route, test and URL.
nextacular chose `Workspace` and it appears in all 37 of its routes; changing it later is not a
rename, it is a rewrite. This decision is made once and is expensive to revisit, so it is made first.

Keelblock's claim is that isolation is enforced by the database. That means the tenancy model must be
expressible as an RLS predicate that is _cheap_ (it runs on every row of every query) and _total_
(no table escapes it).

## Decision Drivers

- The predicate must be indexable and evaluate without a recursive or unbounded join.
- B2B language: buyers say "organization" or "team", not "workspace" — and a workspace usually implies
  _many per organisation_, a second level keelblock v1 does not want.
- Every tenant-scoped table must carry the tenant key directly, so no policy needs a join chain.
- A user belongs to many organizations, with a different role in each.

## Options Considered

### Option A: `organization` + `organization_members`, `organization_id` on every scoped table

| Pros                                                              | Cons                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Predicate is a single indexed membership lookup                   | Denormalized `organization_id` must be kept correct on write |
| Every table self-describes its tenant; no join chains in policies |                                                              |
| Matches B2B vocabulary and Stripe's customer-per-org shape        |                                                              |

### Option B: `workspace` nested under an account (nextacular / MakerKit hybrid)

| Pros                                           | Cons                                                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Supports personal + team accounts in one model | Two levels of scoping in every policy from day one                                                 |
| Familiar to users of those kits                | The second level is unused by most B2B products; it is bloat that cannot be removed (violates B-6) |

### Option C: schema-per-tenant

| Pros                                       | Cons                                                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Hard isolation with no policy to get wrong | Migrations must run per tenant; breaks Supabase tooling, PostgREST and connection pooling at even modest tenant counts |

## Decision

**Chosen: Option A.** A single `organization` root with explicit membership, and a literal
`organization_id` column on every tenant-scoped table.

The denormalized column is deliberate. It is what lets every policy be one indexed predicate rather
than a join chain, and it makes "is this table scoped?" answerable by looking at the table — which is
what allows a gate to enumerate every scoped table and refuse a new one that lacks a policy.

A second level (workspaces/projects within an organization) is a **documented extension point**, not
a v1 feature.

## Consequences

**Positive:** every policy has the same readable shape; the scoped-table set is machine-derivable, so
B-2 and the new-table guard are possible at all; billing maps cleanly to one Stripe customer per org.

**Negative:** `organization_id` can be set wrong on insert. Mitigated by a `WITH CHECK` clause on
every write policy — not just `USING` on reads, which is the single most common RLS mistake and is
what lets a user write a row into another tenant. This gets its own hand-written intent test, because
a generated suite will confirm a missing `WITH CHECK` as green.

## Addendum, 2026-09-08 — when a `SECURITY DEFINER` function is allowed to exist

Decided while closing DEF-014, whose trigger was "SPEC-006 is done" precisely so the question would
be answered against real code rather than from imagination.

**A definer RPC is used only where a policy CANNOT express the operation. Everything a policy can
express stays in the policy.**

There are exactly two such operations today, and both are genuinely inexpressible:

- `create_organization` — the creator must become the owner in the same transaction, and at the
  moment of the INSERT there is no membership row for a policy to consult.
- `accept_invitation` — it writes a membership for somebody who is, by definition, not yet a member.
  No policy on `organization_member` could permit that without permitting much more.

Membership administration is not on that list. It is gated by `is_org_admin` in the policy, with the
invariants a policy cannot state — only an owner may change ownership, an organization may not be
orphaned — held by triggers.

The temptation is to move it behind RPCs anyway, because then the direct write is denied at the
privilege layer and the denial becomes assertable. That is a real gain, and it is outweighed by what
it costs. SPEC-006 measured the cost the same week: `invite_member` re-checked authority with
`if not public.is_org_admin(org)`, `is_org_admin` returned NULL rather than false for a non-member,
`not NULL` is NULL, and the guard fell through in silence — an invitation minted into an organization
the caller had no membership in, with no error. In a policy that same NULL is a refusal, so no policy
was ever wrong; the defect existed only inside the definer function.

That is the general shape rather than one bug. **A definer function moves an authorization decision
from somewhere the database enforces to somewhere a human wrote it**, and every one added is another
place that must be got right by hand. Two are worth it because there is no alternative. Replacing
working policies with a third and a fourth would trade a proven boundary for a hand-written one.
