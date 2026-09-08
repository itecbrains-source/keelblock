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

"World-class" is unfalsifiable. These eleven are not. keel v1 is not done until every one is
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
| B-11 | **Handover-ready**: someone who has never seen this repository — a new developer or a coding agent — can add a tenant-scoped feature correctly on their first attempt, and **prove it themselves without a reviewer** | A scripted trial: a fresh agent session and an unfamiliar developer each given one feature task and only the repository; measured on whether the gates catch what they get wrong |
| B-10 | **Upgradable**: a project scaffolded from keel `N` can adopt keel `N+1`'s security fixes by a documented, tested path | A CI job that scaffolds at the previous tag, applies the upgrade path, and runs the current suite green |

B-6 is the direct answer to the field's loudest complaint — *"retrofitting the boilerplate's
implementation to your needs can be as complicated as implementing the feature from scratch."* Most
kits treat their features as load-bearing. Keel treats **removability as a tested property**, which
is what makes an opinionated starter safe to adopt.

## Handover: the property nobody else can claim

Supastarter's first advertised feature is *"Codebase — AI-ready"*, and its headline is *"the SaaS
starter kit your coding agent deserves."* Their offering is an `AGENTS.md`, monorepo structure and
end-to-end types — a **better map**.

keel's advantage is different in kind, and it is a by-product of everything already built:
**an agent working in keel cannot silently be wrong.**

An agent's characteristic failure is confident, plausible, incorrect code — and every gate here
targets exactly that class:

| The mistake an agent (or a tired developer) makes | What catches it, immediately |
|---|---|
| adds a table, forgets row-level security | `schema` guard names the table |
| writes `with check (true)` because it compiles | `schema` guard — `polwithcheck IS NULL` would not |
| reaches for the service-role client to make a query work | `boundaries`, through the import graph, two hops deep |
| caches a tenant query | `boundaries` — the cache key has no organisation |
| invents a message key | `locale` |
| leaves an unused export or dependency | `unused` |
| claims a promise nothing implements | `promises` |
| widens a permission | the **access-matrix diff**, in the review |

A map tells you where things are. **A gate tells you that you are wrong, in seconds, specifically.**
That is worth more to an agent than any amount of documentation, because it converts the review
bottleneck — a human reading generated code — into something the agent runs itself.

Same property, same value, for a human team: a new hire's first pull request is checked by the same
twelve gates instead of by a senior engineer's attention.

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

## Scope — thirteen areas, one framework

**Next.js only.** No Nuxt, no SvelteKit, no TanStack Start, no React Native. That is the decision
that makes feature-completeness affordable rather than a slogan: Supastarter maintains the same
feature set across three frameworks and MakerKit across three targets, so **keel has roughly 3× the
budget per feature.** The offsetting cost is real and specific — every keel feature also needs
policies, intent tests, access-matrix rows and schema-guard compliance, call it 1.75× — so the net
advantage is real but not threefold. It is enough.

1. Marketing shell · 2. Auth (password, magic link, OAuth, passkeys, 2FA) · 3. Account ·
4. Organisations · 5. Team & invitations · 6. Billing (Stripe: subscriptions, seats, usage) ·
7. Custom domains · 8. Ops & health · 9. **Transactional email** · 10. **File storage** ·
11. **Background jobs & cron** · 12. **Notifications** · 13. **Admin, user management &
impersonation** · 14. **Audit log** · 15. **API keys** · 16. **Outbound webhooks**

Auth covers what the field's routes reveal as table stakes and specs often forget: email
verification, password reset, resend, account unlock, and an organisation switcher.

Plus the adoption layer: `create-keel-app` · docs · demo deployment · upgrade guides · onboarding
flow · legal pages · error monitoring · deployment guides.

### Refused deliberately, with reasons

Not "features we lack" — features whose cost is permanent and whose value is a comparison-table row:

| Refused | Why |
|---|---|
| **Five payment providers** | Stripe covers nearly every buyer. The other four are four webhook surfaces to maintain forever, in exchange for one row in a grid. |
| **Prisma *or* Drizzle** | Choice-as-a-feature is double maintenance for a decision the buyer makes once. ADR-003 settled it, and the reason was tenant isolation. |
| **AI chatbot examples** | A demo dressed as a feature. |
| **Multiple analytics providers** | One, behind a seam. |
| **Blog / CMS** | Most teams use a real CMS. The seam stays clean; the machinery does not ship. |

### Three borrowed features, and why keel's versions are different

BoxyHQ ships SSO, audit logs and webhooks — and **all three are third-party services**: Jackson
(their own product), Retraced, and Svix. Its Prisma schema contains no audit or webhook model at all.
A buyer gets integration code and three vendor relationships. That is a defensible choice, and
"delegate, do not build" is usually right — an audit-log implementation inside a starter is a
liability nobody maintains.

**It is the wrong choice for exactly three things, for one reason: they are tenant-isolation
surfaces, and isolation is what keel claims.**

| Feature | Field's version | keel's version |
|---|---|---|
| **API keys** | A credential fetched by id, then compared to a team in application code — **`getApiKeyById` is the source of [F-15](FINDINGS.md)**, the clearest illustration of the pattern keel exists to replace | A key resolves to an organisation and role, and every query it makes is subject to the same policies as a session. The bypass route that an API key normally opens does not exist. |
| **Audit log** | Delegated to an external service, so the trail lives outside the isolation boundary the product claims | Native and RLS-scoped, so **one tenant provably cannot read another's audit trail** — and it appears in `ACCESS-MATRIX.md` like everything else. Also a hard requirement for impersonation, which is already in scope. |
| **Outbound webhooks** | Delegated for delivery, with payload scoping left to the caller | Payloads scoped to the subscribing organisation, proven by test. A webhook is a data-egress path; scoping it correctly is the same problem as a query, and it is the one place teams leak tenant data without noticing. |

Delivery infrastructure — retries, fan-out, signing at scale — stays a seam. Svix can sit behind it.
**What does not get delegated is the part that decides who sees what.**

### Impersonation is the interesting one

It **deliberately crosses the tenant boundary** — the only feature in the category that does. For a
kit whose whole claim is proven isolation it cannot be a superpower flag: it must be time-boxed,
audited, consented, and visible to the organisation being impersonated. Nobody in the field does that.
It is the feature where keel's thesis produces a **visibly better answer rather than an equal one**.

## Definition of done for v1

- [ ] All six acceptance bars demonstrably met, each by its named artifact.
- [ ] Every SPEC `done`, or its gap covered by an open `DEF-*` with a machine-evaluable trigger.
- [ ] The gates green, and each gate's mutation proof passing.
- [ ] A published access matrix showing who can read and write what, per role, per table.
- [ ] Validation note: a developer with no context scaffolded, built something, and deployed it —
      recorded, with what confused them.
