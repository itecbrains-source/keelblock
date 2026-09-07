# ADR-003: Data access — `supabase-js` for queries, hand-written SQL for schema and policies

**Status:** Accepted · **Date:** 2026-09-07 · **Deciders:** architect

## Context

Two separable questions get conflated into "which ORM": *how the app reads data* and *how schema and
policies are authored*. They have different right answers, and the first one decides whether RLS is
enforced at all.

A client on a **direct Postgres connection** connects as a privileged role and **bypasses RLS unless
explicitly configured otherwise**. Research confirms this is true of both Prisma and Drizzle. A
starter whose claim is database-enforced isolation cannot have its default query path be one that
silently sidesteps the enforcement.

Drizzle can now declare RLS policies in TypeScript with Supabase-specific roles and generate the
migrations — which removes the *capability* objection but raises an *authority* one.

## Decision Drivers

- The default read path must be RLS-enforced by construction, not by remembering to configure it.
- The SQL that governs tenant isolation is the most security-critical text in the repo and must be
  reviewable as SQL, not as a generated build artifact.
- Type safety should not be paid for with a second source of schema truth.

## Options Considered

### Option A: `supabase-js` + hand-written SQL migrations
| Pros | Cons |
|------|------|
| Queries carry the user's JWT — RLS applies by construction | More verbose than an ORM query builder |
| Policies are reviewed as the exact SQL that runs | Types come from generation, not inference |
| One source of truth: the migration files | |

### Option B: Drizzle for queries + Drizzle-declared policies
| Pros | Cons |
|------|------|
| One TypeScript source for schema, policies and queries | The reviewed artifact becomes generated SQL — a diff in a security boundary you did not write |
| Excellent inferred types | Direct-connection default bypasses RLS unless configured; the failure is silent |

### Option C: Hybrid — Drizzle for queries, SQL for policies
| Pros | Cons |
|------|------|
| Ergonomic queries, auditable policies | Two schema sources that must be kept in step; drift between them is a silent isolation bug |

## Decision

**Chosen: Option A.** `supabase-js` on the user's session for all application reads and writes; schema
and policies as hand-written SQL migrations; TypeScript types generated from the database.

The **service-role client is a narrow, audited exception** — it bypasses RLS by design, so it is
confined to named server-only modules (webhooks, scheduled jobs, the invitation accept path), never
imported into a component tree. A gate enforces that boundary, because a service-role client reachable
from a page is a total isolation bypass.

## Consequences

**Positive:** the default path cannot silently bypass RLS; policy review is review of the real SQL;
the scoped-table set is derivable from migrations, which is what makes the new-table guard possible.

**Negative:** more SQL to write and more verbose queries. Accepted — this is the one area where
explicitness is the product. Mitigated by generated types and a small set of tested query helpers.
