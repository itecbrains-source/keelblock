# keel spec set

Governed by [`docs/PRODUCT.md`](../docs/PRODUCT.md) and the [ADRs](../docs/adr/). Format is the
playbook's `_TEMPLATE.spec.md`: intent · scope/non-scope · sources of truth · REQ/AC · DoD ·
deferrals. **Thin.** A spec that outgrows the feature it governs has failed its own purpose.

Status: **Phase 1 authored** (`draft`) — SPEC-001/002/003. The remaining twelve are `planned`
and are deliberately not written yet: specification authored far ahead of contact rots, and the
template's own instruction is to keep it thin.

| SPEC | Title | Bars | ADRs | Status |
|---|---|---|---|---|
| **Phase 1 — the claim** ||||
| SPEC-001 | Tenancy foundation — `organization`, membership, RLS, scoped-table guard | B-2 | 001, 003 | **done** (REQ-1..12; REQ-8/9 now gated by SPEC-003) |
| SPEC-002 | Proof harness — four test layers, access matrix, mutation proofs | B-2, B-4 | 005 | **partial** (unit + generated + intent + matrix + mutation proofs built; journey layer pending auth) |
| SPEC-003 | Gates — freshness, service-role boundary, cache keys, supply chain | B-3, B-4, B-9 | 004, 007 | **done** (REQ-1..9, all mutation-proven) |
| **Phase 2 — identity** ||||
| SPEC-004 | Auth — magic link, OAuth, session, route protection | — | 002 | planned |
| SPEC-005 | Organisations & roles — create, switch, settings, RBAC | B-2 | 001, 002 | planned |
| SPEC-006 | Invitations — invite, accept, decline, join, revoke, role change | B-2 | 001, 002 | planned |
| **Phase 3 — money** ||||
| SPEC-007 | Billing — Stripe, entitlements, webhooks, portal, dunning | — | 006 | planned |
| SPEC-008 | Account & organisation settings surfaces | B-7 | 004 | planned |
| **Phase 4 — surface** ||||
| SPEC-009 | Marketing shell, ops & health endpoints | B-8 | 004 | planned |
| SPEC-010 | Custom domains | — | 004 | planned |
| **Phase 5 — adoption** ||||
| SPEC-011 | `create-keel-app` | B-1 | 007 | planned |
| SPEC-012 | Docs & the stranger walkthrough | B-5 | — | planned |
| SPEC-013 | Upgrade path — `keel upgrade`, codemods, advisories | B-10 | 008 | planned |
| SPEC-014 | Removability — a deletion test per optional module | B-6 | 008 | planned |
| SPEC-015 | Accessibility & performance budgets | B-7, B-8 | 004 | planned |
| SPEC-016 | Release preflight — *is this safe to release?* | B-9, B-10 | 003, 008 | draft |

## Why phase 1 is the proof apparatus and not a login screen

The conventional order is auth first, because it feels like the foundation. It is the wrong order
here. Keel's product **is** the claim in `PRODUCT.md`, and a proof apparatus retrofitted onto working
code only ever confirms what that code already does — which is how a wrong policy gets confirmed
greenly (ADR-005).

Building SPEC-001..003 first means every feature after them lands into a harness that is already
adversarial: a new table without a policy fails, a new cached surface without a tenant key fails, a
new dependency out of date fails. The alternative is fifteen specs of work followed by an audit,
which is the pattern that produces "gates green, still broken."

## Three commands, three questions

Not three names for one job. Each answers a different question, and the cost of a wrong answer rises
sharply down the list:

| Command | Question | A wrong answer costs |
|---|---|---|
| `npm run check` | is this code correct? | a red build |
| `npm run verify` | will CI pass? | a wasted round trip, and real minutes on a private repo |
| `npm run preflight` | **is this safe to release?** | **an outage, or a tenant leak in production** |

`preflight` (SPEC-016) is explicitly forbidden from re-running CI. The moment it does, it is `verify`
with a different name and the third question stops being asked.

## Coverage check

Every acceptance bar in `docs/PRODUCT.md` maps to an owning spec. **A bar with no owner is an unkept
promise**, and this table is read by a gate (`npm run check` → `promises`), so it cannot quietly go
stale. It is a table rather than a sentence because a gate should never have to parse prose.

| Bar | Owned by |
|---|---|
| B-1 | SPEC-011 |
| B-2 | SPEC-001, SPEC-002, SPEC-005, SPEC-006 |
| B-3 | SPEC-003 |
| B-4 | SPEC-002, SPEC-003 |
| B-5 | SPEC-012 |
| B-6 | SPEC-014 |
| B-7 | SPEC-008, SPEC-015 |
| B-8 | SPEC-009, SPEC-015 |
| B-9 | SPEC-003, SPEC-016 |
| B-10 | SPEC-013, SPEC-016 |
