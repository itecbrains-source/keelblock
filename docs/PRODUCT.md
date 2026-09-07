# keel — product definition

> Status: **decided**. This is the governing document. A SPEC that contradicts it is wrong, or this
> document changes first. Decisions carry the date they were made.

## What keel is

A free, MIT-licensed, open-source starter for **multi-tenant B2B SaaS** on Next.js 16, React 19,
TypeScript, Supabase and Stripe.

nextacular is the idea. **keel is the bar.**

## Who it is for

A developer or small team starting a product where customers are *organisations*, not individuals:
teams, roles, invitations, per-seat or per-org billing. Someone who would otherwise pay $199–1,499
for MakerKit, Supastarter or ShipFast, or clone something free and spend a week discovering it is
three majors behind.

## The one claim

**Tenant isolation is enforced by the database and proven by tests that run on every commit and
every night.**

Everything else keel ships — auth, invitations, billing, settings, domains — is table stakes that
several kits already do. This is the only line that is both *the thing every buyer says is missing*
and *the thing no free kit currently offers*. The independent comparisons say it in their own words:

> *"Multi-tenancy, enterprise auth, and audit-grade security are not what these tools produce out of
> the box — they produce a starting point, not a production enterprise system."*

Keel is the starting point that does. If that claim ever stops being verifiably true, keel has no
reason to exist.

## Decisions

| # | Decision | Date | Rationale |
|---|---|---|---|
| D-1 | **MIT, free, open source** | 2026-09-07 | The field is paid and closed; free+open is the structural advantage. A paid tier can be added on top of a known-good free core later; adoption cannot be retrofitted onto a paid one. |
| D-4 | **i18n route structure shipped with one locale** ([ADR-010](adr/ADR-010-internationalisation.md)) | 2026-09-07 | Reverses a non-goal. i18n is pervasive rather than additive, so its cost is proportional to the surface it must be applied to — and that surface was one page. Locale resolves from `next/root-params`, which is what makes it compatible with Cache Components at all. |
| D-3 | **Open core: proof free, evidence paid** ([ADR-009](adr/ADR-009-open-core-boundary.md)) | 2026-09-07 | `saas-testing-toolkit` already implements much of SPEC-002/003 in this stack. Its proof layer becomes keel's, MIT; its compliance layer (SOC2 evidence, auditor pack, traceability) stays paid. Refines D-1 rather than reversing it — D-1 anticipated a paid tier *on top of* a known-good free core. **keel's full claim must hold with nothing paid installed, and a gate asserts it.** |
| D-2 | **Supabase Auth**, not Better Auth | 2026-09-07 | RLS policies key off `auth.uid()` from a Supabase-issued JWT. Keel's claim needs no bridge and no asterisk. Accepted cost: organisations, members, invitations and RBAC are keel's to build and test — a large share of v1 that Better Auth's organization plugin would have given free. |

## Non-goals

Named because every one of these is a real complaint about existing kits, and *not doing them* is a
feature:

- **Not a component library.** shadcn/ui is used; keel does not invent a design system to fight.
- **Not feature-maximal.** Supastarter ships five payment providers, an AI chatbot and i18n. That is
  their game and it is the bloat complaint. Keel ships one good path per concern.
- **Not a framework.** No `keel.config.ts` runtime, no plugin lifecycle, no abstraction over Next or
  Supabase. It is *your* code from the first commit.
- **Not single-tenant B2C.** ShipFast is better at that and cheaper than free is worth.
- **No admin panel, no CMS** in v1. Clean seams, no pre-installed machinery.
- ~~No i18n~~ — **corrected 2026-09-07 ([ADR-010](adr/ADR-010-internationalisation.md)).** Grouping
  i18n with those two was a category error: they are *additive*, i18n is *pervasive*. Its retrofit
  moves every route and every link, so the cost scales with screen count — and keel had one page.
  Shipped with a single locale, at the cheapest moment it will ever have.

## The enterprise surface — a recognised gap, not a non-goal

[BoxyHQ](https://github.com/boxyhq/saas-starter-kit) (4,928 stars, Apache-2.0) ships SAML SSO, SCIM
directory sync, audit logs, webhooks and API keys — and enforces tenant isolation with hand-written
application guards, with **zero** row-level security anywhere in its schema. That is the clearest
evidence for keel's thesis and, simultaneously, the clearest statement of what keel does not yet have.

**These are not non-goals.** keel targets multi-tenant B2B SaaS, and SSO, SCIM and audit logs are
exactly what a B2B buyer's security review asks for. Calling them out of scope would be convenient
rather than true, so they are registered as **DEF-005** instead.

Two things worth taking from how BoxyHQ does it:

- **Delegate, do not build.** Their SSO is Jackson, audit logs are Retraced, webhooks are Svix. None
  of it is written from scratch, and that is the right instinct — an audit-log implementation in a
  starter kit is a liability its author will not maintain.
- **Read their feature list knowing the business model.** The kit is a funnel for Jackson, BoxyHQ's
  own SSO product. Free-and-enterprise-featured is distribution strategy, not generosity, and it
  explains which features got built first.

The ordering keel keeps: **isolation proven, then the enterprise surface.** A kit with SSO and no
provable isolation is the arrangement the whole field already offers.

## The acceptance bar

"World-class" is unfalsifiable. These ten are not. keel v1 is not done until every one is
demonstrably true, and each is owned by a SPEC.

| # | Bar | How it is proven |
|---|---|---|
| B-1 | `npx create-keel-app` → running app with auth, an organisation and a green test suite in **under 5 minutes** on a clean machine | A timed CI job that scaffolds from the published package and runs `npm run check` |
| B-2 | **Cross-tenant isolation is proven, not asserted** — every tenant-scoped table, every command, every identity | Generated pgTAP suite + hand-written intent tests, in CI and nightly, with a published access matrix |
| B-3 | **Nothing is more than one major behind**, and staleness fails the build | The freshness gate: dated stamps that expire, checked offline so it cannot be dodged |
| B-4 | **Every "no X" promise has a gate, and every gate has a proof it can fail** | Each gate ships a mutation test that restores the real defect and asserts red |
| B-5 | **A stranger reaches their first deployed feature using only the docs** | A scripted walkthrough run by someone with no prior context, timed and recorded |
| B-6 | **Any optional subsystem is removable in one commit** | A removal test per optional module: delete it, and typecheck + build + the remaining suite stay green |
| B-7 | **Accessible**: keyboard-complete, axe-clean on every shipped surface | An automated axe pass in CI plus a manual keyboard walkthrough per surface |
| B-8 | **Fast**: a performance budget that fails the build, not a Lighthouse screenshot | Budget asserted in CI against the built app |
| B-9 | **Secure by default**: CSP, security headers, rate limiting, secret scanning over full history | Header assertions in e2e; gitleaks in pre-commit and CI |
| B-10 | **Upgradable**: a project scaffolded from keel `N` can adopt keel `N+1`'s security fixes by a documented, tested path | A CI job that scaffolds at the previous tag, applies the upgrade path, and runs the current suite green |

B-6 is the direct answer to the field's loudest complaint — *"retrofitting the boilerplate's
implementation to your needs can be as complicated as implementing the feature from scratch."* Most
kits treat their features as load-bearing. Keel treats **removability as a tested property**, which
is what makes an opinionated starter safe to adopt.

## Beating the paid field

The bar is not nextacular. It is MakerKit ($349–649), Supastarter (€349–€1,499), Achromatic and
ShipFast ($199–299) — funded products with years of head start.

**Where keel does not compete, deliberately:** feature count and framework breadth. Supastarter ships
five payment providers, an AI chatbot, i18n and Nuxt/SvelteKit builds; MakerKit ships TanStack Start
and an Expo React Native kit. Matching that is their game, it is years of work, and it is the exact
bloat the field is criticised for. Keel ships one good path per concern.

**Where every one of them is weak, checked against their own material:**

| Axis | Field's state | keel must | Proof |
|---|---|---|---|
| **Proof of isolation** | Nobody publishes any. MakerKit "some tests", Supastarter journey e2e, ShipFast none | Prove it per table × command × identity, and publish the matrix | B-2 |
| **Rot resistance** | Stays current because a paid maintainer does it — a person, not a property | Make staleness fail the build | B-3 |
| **Removability** | The loudest complaint in every review; nobody solves it | Make deleting a module a tested property | B-6 |
| **Upgradability** | You cloned it in March; a security fix lands in September; there is no path | Give a scaffolded project a tested route to upstream fixes | **B-10** |
| **Verifiable promises** | Marketing claims, no mechanism | Every "no X" has a gate; every gate has a proof it can fail | B-4 |
| **Price** | $199–1,499 | Free, MIT | D-1 |

**B-10 is the one to lead with after isolation.** It is the deepest structural failure of the entire
boilerplate category: the product is a *copy*, so the moment you clone it you are forked off
maintenance forever. Every kit in the table has this problem and none advertises a solution, because
there isn't one — which is exactly why solving it is worth more than a sixth payment provider.

## Scope — the eight areas

Parity with nextacular's surface (37 routes, enumerated from its `src/pages` tree), plus the
adoption layer that makes it usable by strangers.

1. Marketing shell · 2. Auth · 3. Account · 4. Organisations · 5. Team & invitations ·
6. Billing · 7. Custom domains · 8. Ops & health

Plus: `create-keel-app` · docs · demo deployment · upgrade guides.

## Definition of done for v1

- [ ] All six acceptance bars demonstrably met, each by its named artifact.
- [ ] Every SPEC `done`, or its gap covered by an open `DEF-*` with a machine-evaluable trigger.
- [ ] The gates green, and each gate's mutation proof passing.
- [ ] A published access matrix showing who can read and write what, per role, per table.
- [ ] Validation note: a developer with no context scaffolded, built something, and deployed it —
      recorded, with what confused them.
