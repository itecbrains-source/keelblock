# Stack findings — and the decisions they force

*Researched 2026-09-07. Each section ends with the ADR it feeds. Nothing here is decided.*

## 1. Auth — genuinely contested, and it is the load-bearing choice

MakerKit moved to **Better Auth**, whose organization plugin ships organizations, members,
invitations and RBAC as generated schema + server APIs + client SDK. Independent comparisons call
that *"the strongest reason to pick Better Auth for B2B SaaS"*, and note that Supabase and Auth.js
*"leave tenancy to your app (or a kit)."*

The counterweight, from the same sources: **Supabase Auth is the pick when you want
database-enforced authorization through RLS** — which is keel's entire differentiator. Supabase RLS
policies key off `auth.uid()` from a Supabase-issued JWT; Better Auth owns users in your own
Postgres and issues its own session, so RLS integration is something you build rather than inherit.

**The real trade:** Better Auth hands you the tenancy *feature set* and leaves you to wire the
*enforcement*. Supabase Auth hands you the enforcement substrate and leaves you to build the feature
set. Keel's claim is enforcement, so this leans Supabase — but the org/invite/RBAC work Better Auth
would have given free is then keel's to write, and that is a large share of v1.

→ **ADR-002. Do not treat as settled.** The lazy answer ("we said Supabase") skips the trade.

## 2. RLS testing — most of this is already built, with one crucial gap

[`rlsautotest`](https://github.com/unitautogen/rlsautotest) (Apache-2.0, Python 3.10+) reads policies
from the catalog and generates a pgTAP suite proving, per table × command × identity, who can
SELECT/INSERT/UPDATE/DELETE which rows — plus an access-matrix report and a CI gate that fails on
any leak or unprotected table. Featured in Supabase's July 2026 developer update.

**Its own README states the limit, and it is the whole point:**

> *"It proves your database enforces what your policies declare. It cannot know your intent: a wrong
> policy will be faithfully (and greenly) confirmed."*

That is the "a check that cannot fail" trap in someone else's words. So the answer is **both layers,
and they are different tests**:

- **Declaration ↔ enforcement** — generated, exhaustive, free. Adopt `rlsautotest`; do not rebuild it.
- **Intent ↔ declaration** — hand-written, small, adversarial. *Should* a member read another org's
  invoices? Only a human can assert that, and only these tests catch a confidently-wrong policy.

Also note the operational caveat: it seeds rows and executes real queries before rolling back, so it
is local/CI only, never production.

→ **ADR-005 (testing strategy).** Adopt the generator; own the intent layer.

## 3. ORM — Drizzle can express RLS, which removes the reason to avoid it

Drizzle supports declaring RLS policies in TypeScript alongside the table, with predefined Supabase
roles and helpers, and generates the migrations. That materially weakens the "ORMs push you toward
app-layer filtering" objection that disqualified Prisma.

Open question is not capability but **authority**: if policies live in TypeScript and are generated,
the migration is a build artifact — which complicates reviewing the exact SQL that governs tenant
isolation, the one file that most deserves a careful human read.

→ **ADR-003 (data access).** Options: raw SQL migrations (auditable, verbose) · Drizzle-generated
(ergonomic, one source of truth) · hybrid (Drizzle for queries, hand-written SQL for policies).

## 4. Next.js 16 — caching became explicit, which is good news for a starter

Cache Components make caching **opt-in** via `use cache`; everything dynamic executes per request by
default, replacing the implicit caching that made App Router data-freshness bugs so common. Paired
with tag-based invalidation and PPR. Guidance is to establish a **central cache-tag registry early**
— cheap in a starter, painful to retrofit.

For a multi-tenant kit this matters more than usual: a cache key that omits the tenant is a
cross-tenant data leak that RLS cannot save you from, because the data is served from cache and never
reaches the database. **This deserves its own gate.**

→ **ADR-004 (rendering & cache), and a candidate REQ: no `use cache` without a tenant-scoped key.**

## 5. Stripe — the shape is well established; the failure modes are known

- **Idempotency:** store `event.id`, skip if seen. Stripe delivers at-least-once, not exactly-once;
  without this you get duplicate subscriptions and double fulfilment.
- **Source of truth:** Stripe is the billing engine; **your database defines entitlements.** Never
  treat Stripe as the access-control authority.
- **Minimum four events:** checkout completed · subscription updated · subscription deleted ·
  payment failed.
- **Proration:** `create_prorations` on mid-cycle change, previewed before confirming.
- **Dunning:** SaaS without a recovery flow loses **10–20% of MRR** to involuntary churn.

→ **ADR-006 (billing).** Little to invent; a lot to get exactly right.

## 6. Supply chain — 2026 baseline, and npm now helps

- `npm ci --ignore-scripts`; postinstall is a live attack vector (npm 11 already warns via
  `allow-scripts`).
- **gitleaks** pre-commit *and over full history* — a hit is a live compromise: revoke and rotate first.
- **Renovate/Dependabot** to propose bumps — necessary but not sufficient: nextacular had CI and
  rotted anyway. Automation proposes; a gate must force.
- **Trusted Publishing (OIDC) + provenance attestations** via Sigstore if keel is ever published to
  npm — which `npx create-keel-app` would require.
- SLSA L2 is a realistic target; only ~30% of orgs reach L3.

→ **ADR-007 (supply chain & release).**

## Sources

**Primary** — the documentation and repositories of the things being decided between:

- [next-intl](https://next-intl.dev/docs/getting-started/app-router) and [`next/root-params`](https://next-intl.dev/blog/nextjs-root-params)
- [Next.js 16 release notes](https://nextjs.org/blog/next-16) · [Cache Components migration guide](https://nextjs.org/docs/app/guides/migrating-to-cache-components)
- [rlsautotest](https://github.com/unitautogen/rlsautotest) · the tool's own README, including its stated limits
- [Supabase — testing overview](https://supabase.com/docs/guides/local-development/testing/overview) · [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Drizzle — RLS](https://orm.drizzle.team/docs/rls)
- [Stripe documentation](https://docs.stripe.com/billing/subscriptions/webhooks)

**Secondary** — comparisons and practitioner write-ups, used for orientation only:

- [Better Auth vs Clerk vs NextAuth vs Supabase Auth](https://makerkit.dev/blog/tutorials/better-auth-vs-clerk) · [TurboStarter's version](https://www.turbostarter.dev/blog/better-auth-vs-clerk-vs-nextauth-vs-supabase-auth)
- [rlsautotest](https://github.com/unitautogen/rlsautotest) · [Supabase discussion](https://github.com/orgs/supabase/discussions/47191) · [Supabase testing docs](https://supabase.com/docs/guides/local-development/testing/overview) · ["RLS fails silently"](https://dev.to/munaf-khatri/rls-fails-silently-heres-how-to-actually-test-your-supabase-policies-p6m)
- [Drizzle RLS docs](https://orm.drizzle.team/docs/rls) · [drizzle-supabase-rls](https://github.com/rphlmr/drizzle-supabase-rls)
- [Next.js 16 release](https://nextjs.org/blog/next-16) · [Migrating to Cache Components](https://nextjs.org/docs/app/guides/migrating-to-cache-components)
- [Stripe webhooks best practices](https://apiscout.dev/guides/stripe-webhooks-complete-guide-2026) · [Stripe billing patterns 2026](https://www.hassanjaved.work/blog/stripe-billing-saas-2026-patterns)
- [npm supply chain 2026](https://mondoo.com/blog/npm-supply-chain-security-package-manager-defenses-2026) · [npm security best practices](https://github.com/bodadotsh/npm-security-best-practices)
