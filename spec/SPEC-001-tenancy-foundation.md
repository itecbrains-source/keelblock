# SPEC-001: Tenancy foundation

> Status: `done` (spike-corrected 2026-09-07 — see `research/03-SPIKE-RESULTS.md`) ·
> Contracts: SPEC-002, SPEC-003 · Bars: **B-2** · ADRs: [001](../docs/adr/ADR-001-tenancy-model.md), [003](../docs/adr/ADR-003-data-access.md)

## Intent

Establish the organisation/membership model and the row-level security that makes tenant isolation a
property of the database rather than a convention the application remembers. This spec is keel's
product claim in its most literal form: every requirement here is something the field's paid kits
leave to the reader.

## Scope / non-scope

- **In scope:** the `organization` and `organization_member` tables · the role model · RLS on every
  tenant-scoped table, deny by default, with `WITH CHECK` on writes · the membership predicate and its
  index · `SECURITY DEFINER` helper hardening · the service-role boundary · the machine-derivable
  scoped-table set that later gates depend on.
- **Out of scope:** authentication itself (SPEC-004) · organisation CRUD surfaces (SPEC-005) ·
  invitations (SPEC-006) · the tests that prove all this (SPEC-002 — deliberately a separate spec, so
  the proof cannot quietly become "the code we wrote passes the tests we wrote").

## Sources of truth

- `docs/PRODUCT.md`
- `docs/adr/ADR-001-tenancy-model.md`
- `docs/adr/ADR-003-data-access.md`
- `research/02-STACK-FINDINGS.md`

## Requirements

### REQ-1 — `organization` is the root tenant entity

A single root table. Membership is explicit in `organization_member (organization_id, user_id, role)`,
referencing `auth.users`. A user belongs to many organisations with an independent role in each.

### REQ-2 — every tenant-scoped table carries `organization_id` directly

No policy resolves tenancy through a join chain. The column is denormalised on purpose (ADR-001): it
makes each policy one indexed predicate, and it makes "is this table tenant-scoped?" answerable by
inspecting the table — which is what REQ-8 depends on.

### REQ-3 — RLS is enabled and denies by default

Every tenant-scoped table has RLS enabled with no permissive fallback. The absence of a matching
policy is a denial, never an allowance. `anon` reaches nothing tenant-scoped.

### REQ-4 — every write policy has a _meaningful_ `WITH CHECK` clause

`USING` governs which rows are visible; **`WITH CHECK` governs which rows may be written.** A policy
with `USING` alone lets an authenticated user _insert a row into another organisation_ while appearing
correct on read.

Two facts from the spike (`research/03-SPIKE-RESULTS.md` F-3, F-4) shape this requirement:

- **The smuggled row is invisible to the attacker.** Measured: user A inserted into Org B and still
  saw only their own row. A suite that proves isolation by _reading_ can never catch this — only one
  that attempts a cross-tenant _write_ and asserts rejection.
- **Presence is not enough.** The defect's policy _has_ a `WITH CHECK`; it is `true`. A check for
  `polwithcheck IS NULL` misses it entirely. The requirement is a clause that actually constrains the
  organisation, and the gate must reject a trivially-true one.

### REQ-5 — the membership predicate is indexed and evaluated once per query

Policies use `(select auth.uid())` rather than a bare `auth.uid()`, so the value is evaluated once
rather than per row. `organization_member (organization_id, user_id)` is indexed, and
`(user_id, organization_id)` covers the reverse lookup. A correct policy that table-scans is a policy
that gets removed under load.

### REQ-6 — `SECURITY DEFINER` helpers are hardened

Any helper used inside a policy runs with a pinned `search_path`, is owned deliberately, and is
`STABLE`. An unpinned `search_path` on a definer function is a documented privilege-escalation class,
and a helper reachable inside a policy is reachable by every caller of every scoped table.

### REQ-7 — the role model is defined once, in both languages, and pinned

Roles are `owner | admin | member`. The set and its permitted actions exist in SQL (for policies) and
TypeScript (for UI gating), and a test asserts the two agree. Two hand-maintained copies of a
permission matrix drift, and the drift is silent until it is a privilege bug.

### REQ-8 — the tenant-scoped table set is machine-derivable

A single query over the catalog returns every table carrying `organization_id`, and every such table's
RLS state and policy set. This is the input to the new-table guard (SPEC-003) and the access matrix
(SPEC-002). Without it, both degrade into hand-maintained lists that go stale.

### REQ-9 — the service-role client is confined

The service-role key bypasses RLS entirely. It lives in named server-only modules, is never imported
into a component tree, and every use site carries a one-line justification. A service-role client
reachable from a rendered page is a total isolation bypass and would make every other requirement here
decorative.

### REQ-10 — organisation deletion leaves nothing behind

Deleting an organisation removes or anonymises all its rows by explicit `ON DELETE` behaviour declared
per table, not by application cleanup. An orphaned row with a dangling `organization_id` is
unreachable by policy and therefore invisible to every proof in SPEC-002 — a leak nobody can see.

### REQ-11 — `SECURITY DEFINER` helpers return scalars, never rows

Measured in the spike (F-2): on Supabase, `postgres` is **not a superuser but carries `BYPASSRLS`**,
and `FORCE ROW LEVEL SECURITY` does **not** stop it — postgres read every row across both
organisations with FORCE enabled.

Two consequences:

1. A `SECURITY DEFINER` function owned by `postgres` runs with **RLS bypassed**. The membership helper
   works _because of_ this, not despite it. One that returns rows rather than a boolean is therefore a
   total isolation bypass with no policy involved — and invisible to every layer of SPEC-002.
2. Any remediation advice that treats `FORCE` as the fix for owner-bypass is wrong on Supabase,
   including the advice `rlsautotest` itself prints.

**Smoke testing added the missing half** (`research/04-SMOKE-RESULTS.md` S-4). Postgres grants
`EXECUTE` on new functions to `PUBLIC`, so on a real stack the membership helper was callable by
**`anon`** — an unauthenticated oracle over an RLS-protected table. Every definer helper therefore
ships with `revoke execute … from public, anon` in the same migration that creates it. The bare
container used in the first spike did not model this: _a spike environment that is nearly the target
returns nearly the truth._

So: definer helpers reachable by `authenticated` return a scalar, take only the values they need, have
`EXECUTE` revoked from `public` and `anon`, and are enumerated. The set of `BYPASSRLS` roles is a reviewed, committed artifact — an unreviewed one is
a bypass nobody is looking at.

### REQ-12 — destructive default privileges are revoked

**MEASURED on a clean local stack, during the build:** `set role anon; truncate public.organization
cascade;` **succeeded**, cascading to `organization_member` and `project` — every tenant's rows
removed by an unauthenticated role.

Cause: `pg_default_acl` grants `Dxtm` (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) to `anon` and
`authenticated` for tables created by `postgres`, and **RLS does not apply to TRUNCATE at all**. No
policy in this repository can prevent it, which means no policy test — generated or intent — would
ever have seen it. It is a Supabase default, so every project inheriting it carries the same grant.

Exploitability, stated honestly: PostgREST exposes no TRUNCATE verb (verified — 404), so this is not
a remote zero-click. It is a defence-in-depth failure that converts any SQL injection in a
`SECURITY INVOKER` function, or a leaked role credential, from a scoped read into total data loss.

So: `TRUNCATE`, `REFERENCES` and `TRIGGER` are revoked from `anon` and `authenticated`, and the
default privileges are altered so a table created later cannot silently reintroduce them.

## Acceptance criteria

| AC    | Verifies     | Method     | Evidence                                                                                                                                                                                 | Status   |
| ----- | ------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-1  | REQ-1, REQ-2 | test       | `supabase/migrations/20260907120000_tenancy_foundation.sql`                                                                                                                              | **done** |
| AC-2  | REQ-3        | test       | `supabase/tests/intent/001-tenant-isolation.test.sql` — anon and a foreign member are denied on every scoped table                                                                       | **done** |
| AC-3  | REQ-4        | test       | `supabase/tests/intent/001-tenant-isolation.test.sql` — a member cannot INSERT or UPDATE a row into another organisation, asserted **as the writer** (the row is invisible to them, F-3) | **done** |
| AC-3b | REQ-4        | test       | `supabase/tests/intent/004-schema-guard.test.sql` — a write policy whose `WITH CHECK` is trivially true is rejected (F-4)                                                                | **done** |
| AC-4  | REQ-5        | analysis   | `supabase/migrations/20260907120000_tenancy_foundation.sql` — `EXPLAIN` output showing index use and one-time `auth.uid()` evaluation                                                    | **done** |
| AC-5  | REQ-6        | test       | `supabase/tests/intent/001-tenant-isolation.test.sql` — every definer function reachable from a policy has a pinned `search_path`                                                        | **done** |
| AC-6  | REQ-7        | test       | `supabase/tests/intent/003-membership-invariants.test.sql` — the SQL role matrix and the TypeScript one are equal                                                                        | **done** |
| AC-7  | REQ-8        | test       | `supabase/tests/intent/004-schema-guard.test.sql` — the catalog query returns the expected set, and fails when a scoped table is added without a policy                                  | **done** |
| AC-8  | REQ-9        | test       | `scripts/check-boundaries.test.mts` — importing the service-role client from a client-reachable module fails the gate                                                                    | **done** |
| AC-9  | REQ-10       | test       | `supabase/tests/intent/003-membership-invariants.test.sql` — after deletion, no row anywhere retains the organisation id                                                                 | **done** |
| AC-10 | REQ-11       | test       | `supabase/tests/intent/001-tenant-isolation.test.sql` — no definer function reachable by `authenticated` returns a row type                                                              | **done** |
| AC-11 | REQ-11       | inspection | `supabase/migrations/20260907120000_tenancy_foundation.sql` — the reviewed inventory, with a test that fails when an unlisted role gains the attribute                                   | **done** |
| AC-12 | REQ-11       | test       | `supabase/tests/intent/001-tenant-isolation.test.sql` — the membership helper is not callable by `anon`                                                                                  | **done** |
| AC-13 | REQ-12       | test       | `supabase/tests/intent/001-tenant-isolation.test.sql` — neither `anon` nor a member can `TRUNCATE` a tenant table                                                                        | **done** |

## Definition of Done

- [ ] Every REQ `done` with its AC passing, or covered by an open `DEF-*` with a machine-evaluable trigger.
- [ ] The generated access matrix (SPEC-002) shows no unexpected grant.
- [ ] Cheap gates green: typecheck · unit · pgTAP · build · traceability · deferral lint.
- [ ] **Validation note:** a second pair of eyes read the policy SQL as SQL — not the TypeScript that
      calls it, and not a passing test — and agreed it says what it means. AC-3 and AC-5 exist because
      a green suite is compatible with a wrong policy.

## Deferrals

None yet. A second scoping level (workspaces within an organisation) is a documented extension point
in ADR-001, not deferred work: it is out of scope by decision, and filing it as debt would be filing a
deferral for something nobody chose to build.
