# ADR-001: Tenancy model — `organization` as the root entity, membership as the boundary

**Status:** Accepted · **Date:** 2026-09-07 · **Deciders:** owner, architect

## Context

The root tenant entity's name and shape propagate into every table, policy, route, test and URL.
nextacular chose `Workspace` and it appears in all 37 of its routes; changing it later is not a
rename, it is a rewrite. This decision is made once and is expensive to revisit, so it is made first.

Keel's claim is that isolation is enforced by the database. That means the tenancy model must be
expressible as an RLS predicate that is *cheap* (it runs on every row of every query) and *total*
(no table escapes it).

## Decision Drivers

- The predicate must be indexable and evaluate without a recursive or unbounded join.
- B2B language: buyers say "organisation" or "team", not "workspace" — and a workspace usually implies
  *many per organisation*, a second level keel v1 does not want.
- Every tenant-scoped table must carry the tenant key directly, so no policy needs a join chain.
- A user belongs to many organisations, with a different role in each.

## Options Considered

### Option A: `organization` + `organization_members`, `organization_id` on every scoped table
| Pros | Cons |
|------|------|
| Predicate is a single indexed membership lookup | Denormalised `organization_id` must be kept correct on write |
| Every table self-describes its tenant; no join chains in policies | |
| Matches B2B vocabulary and Stripe's customer-per-org shape | |

### Option B: `workspace` nested under an account (nextacular / MakerKit hybrid)
| Pros | Cons |
|------|------|
| Supports personal + team accounts in one model | Two levels of scoping in every policy from day one |
| Familiar to users of those kits | The second level is unused by most B2B products; it is bloat that cannot be removed (violates B-6) |

### Option C: schema-per-tenant
| Pros | Cons |
|------|------|
| Hard isolation with no policy to get wrong | Migrations must run per tenant; breaks Supabase tooling, PostgREST and connection pooling at even modest tenant counts |

## Decision

**Chosen: Option A.** A single `organization` root with explicit membership, and a literal
`organization_id` column on every tenant-scoped table.

The denormalised column is deliberate. It is what lets every policy be one indexed predicate rather
than a join chain, and it makes "is this table scoped?" answerable by looking at the table — which is
what allows a gate to enumerate every scoped table and refuse a new one that lacks a policy.

A second level (workspaces/projects within an organisation) is a **documented extension point**, not
a v1 feature.

## Consequences

**Positive:** every policy has the same readable shape; the scoped-table set is machine-derivable, so
B-2 and the new-table guard are possible at all; billing maps cleanly to one Stripe customer per org.

**Negative:** `organization_id` can be set wrong on insert. Mitigated by a `WITH CHECK` clause on
every write policy — not just `USING` on reads, which is the single most common RLS mistake and is
what lets a user write a row into another tenant. This gets its own hand-written intent test, because
a generated suite will confirm a missing `WITH CHECK` as green.
