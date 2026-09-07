# keel

**A multi-tenant SaaS starter where tenant isolation is enforced by the database and proven on every
commit.** Next.js 16 · React 19 · TypeScript · Supabase · Stripe. MIT.

> **Status: foundation.** The tenancy layer, the proof harness and the gates are built and green.
> Auth, billing and the product surfaces are specced and not yet built — see
> [the spec index](spec/README.md). This README describes what exists today, not what is planned.
> If that distinction ever blurs, the project has failed its own first rule.

---

## Why this exists

Every comparison of SaaS starters reaches the same conclusion, in their words:

> *"Multi-tenancy, enterprise auth, and audit-grade security are not what these tools produce out of
> the box — they produce a starting point, not a production enterprise system."*

The field is priced $199–$1,499 and closed. The free options are a deliberately minimal reference
kit that uses neither Supabase nor RLS, and one that is three Next majors behind. **None of them —
paid or free — ships proof that its tenant isolation works.**

keel is the one that does, and it is free.

## The claim, and how to check it

Isolation is proven per table × command × identity, and the result is published as
**[`docs/ACCESS-MATRIX.md`](docs/ACCESS-MATRIX.md)** — generated from the live policy catalog by
probing the database as each identity, so it describes what the database *does*, not what anyone
believes it does. It is regenerated on every run and a stale copy fails the build, so a policy change
that alters who can reach what shows up as a diff in review.

**A new tick in the "different organisation" column is a tenant leak, caught in a document before it
reaches a user.**

Four test layers, each answering a different question:

| Layer | Question | How |
|---|---|---|
| Unit | is this pure logic correct? | Vitest, with a mutation proof per gate |
| Generated policy | does the database enforce what the policies **declare**? | `rlsautotest` → pgTAP, regenerated each run |
| **Intent** | are the policies **what we meant**? | hand-written, adversarial pgTAP |
| Journey | does the real authenticated flow work? | Playwright *(with auth, SPEC-004)* |

The middle two are not redundant, and we measured why: a helper that dropped its `user_id` check
produced a **total cross-tenant leak that the generated suite reported as clean** — because it mocks
opaque policy functions. See [F-2](docs/FINDINGS.md).

## What we found by measuring

[`docs/FINDINGS.md`](docs/FINDINGS.md) — eight findings, each with a reproduction:

- **`anon` could TRUNCATE every tenant table** on a default Supabase project. RLS does not apply to
  TRUNCATE, so no policy and no policy test could see it.
- **`FORCE ROW LEVEL SECURITY` does not stop the owner** on Supabase — including in the remediation
  the tooling itself recommends.
- **A cross-tenant write is invisible to the attacker**, so a read-based isolation suite structurally
  cannot catch it.
- **Cache Components break every authenticated page** in Next 16 unless the read streams.

Two of the eight were keel's own mistakes. They are published for the same reason as the rest.

## Getting started

```bash
git clone <this repo> && cd keel
npm install
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt   # the policy prober
cp .env.example .env.local                                            # fill from `supabase status`
supabase start
npm run check
```

`npm run check` runs six gates and **reports every failure, not just the first**:

```
✓ typegen    route types are generated
✓ typecheck  types are sound
✓ lint       no lint regressions
✓ unit       pure logic is correct
✓ policy     the database enforces isolation
✓ matrix     the published access matrix is current
```

## How it is built

| Decision | Where |
|---|---|
| `organization` as the tenant root; membership as the boundary | [ADR-001](docs/adr/ADR-001-tenancy-model.md) |
| Supabase Auth, so policies key off `auth.uid()` with no bridge | [ADR-002](docs/adr/ADR-002-auth.md) |
| `supabase-js` for queries, hand-written SQL for policies | [ADR-003](docs/adr/ADR-003-data-access.md) |
| Cache Components, tenant-scoped keys | [ADR-004](docs/adr/ADR-004-rendering-and-cache.md) |
| Four test layers; the generated suite cannot judge intent | [ADR-005](docs/adr/ADR-005-testing.md) |
| Stripe bills, the database entitles | [ADR-006](docs/adr/ADR-006-billing.md) |
| Freshness gate — staleness fails the build | [ADR-007](docs/adr/ADR-007-supply-chain-and-freshness.md) |
| Upgradability — a security fix must be able to reach you | [ADR-008](docs/adr/ADR-008-upgradability.md) |
| Open core — proof is free, audit evidence is paid | [ADR-009](docs/adr/ADR-009-open-core-boundary.md) |

Scope, non-goals and the ten acceptance bars: [`docs/PRODUCT.md`](docs/PRODUCT.md).

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md). Security issues: [`SECURITY.md`](SECURITY.md) — privately, please.
