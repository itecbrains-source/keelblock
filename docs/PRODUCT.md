# keelblock — product definition

> Status: **decided**. This is the governing document. A SPEC that contradicts it is wrong, or this
> document changes first. Decisions carry the date they were made.

## What keelblock is

A free, MIT-licensed, open-source starter for **multi-tenant B2B SaaS** on Next.js 16, React 19,
TypeScript, Supabase and Stripe.

nextacular is the idea. **keelblock is the bar.**

## Who it is for

A developer or small team starting a product where customers are _organisations_, not individuals:
teams, roles, invitations, per-seat or per-org billing. Someone who would otherwise pay $199–1,499
for MakerKit, Supastarter or ShipFast, or clone something free and spend a week discovering it is
three majors behind.

## The one claim

**Tenant isolation is enforced by the database and proven by tests that run on every push and
every night.**

_"Every push", not "every commit", and the difference is measured rather than pedantic: CI builds the
tip of a push, so a batch of four commits produces one run and three commits are verified only as
part of the state that followed them. On 2026-09-08 the commit that shipped sign-in had no run of its
own. The alternative is to push singly and spend a run per commit; the claim is worded to match what
actually happens instead._

Everything else keelblock ships — auth, invitations, billing, settings, domains — is table stakes that
several kits already do. This is the only line that is both _the thing every buyer says is missing_
and _the thing no free kit currently offers_. The independent comparisons say it in their own words:

> _"Multi-tenancy, enterprise auth, and audit-grade security are not what these tools produce out of
> the box — they produce a starting point, not a production enterprise system."_

Keelblock is the starting point that does. If that claim ever stops being verifiably true, keelblock has no
reason to exist.

## Decisions

| #   | Decision                                                                                           | Date       | Rationale                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-1 | **MIT, free, open source**                                                                         | 2026-09-07 | The field is paid and closed; free+open is the structural advantage. A paid tier can be added on top of a known-good free core later; adoption cannot be retrofitted onto a paid one.                                                                                                                                                                                                                |
| D-6 | **Four tiers price support and evidence; the code is never sold** ([COMMERCIAL.md](COMMERCIAL.md)) | 2026-09-07 | Solo (free) · Startup · Agency · Enterprise, mirroring the field's structure while pricing something different. Refines D-1 and ADR-009 rather than reversing them: charging for the repository would forfeit the only structural advantage keelblock has, and make every "free and open" claim in this document false. Prices themselves are unset pending research (DEF-009).                      |
| D-5 | **Next.js only, with the port seam kept honest** ([ADR-012](adr/ADR-012-framework-portability.md)) | 2026-09-07 | One framework is what makes feature-completeness affordable. But the parts that took longest — schema, policies, the proof harness, the gates, the access matrix — are **framework-agnostic already**, so a future Nuxt or TanStack port reuses them and rewrites only `src/`. Recorded as a structure to preserve rather than a promise to keep.                                                    |
| D-4 | **i18n route structure shipped with one locale** ([ADR-010](adr/ADR-010-internationalization.md))  | 2026-09-07 | Reverses a non-goal. i18n is pervasive rather than additive, so its cost is proportional to the surface it must be applied to — and that surface was a single page at the time. Locale resolves from `next/root-params`, which is what makes it compatible with Cache Components at all.                                                                                                             |
| D-3 | **Open core: proof free, evidence paid** ([ADR-009](adr/ADR-009-open-core-boundary.md))            | 2026-09-07 | `saas-testing-toolkit` already implements much of SPEC-002/003 in this stack. Its proof layer becomes keelblock's, MIT; its compliance layer (SOC2 evidence, auditor pack, traceability) stays paid. Refines D-1 rather than reversing it — D-1 anticipated a paid tier _on top of_ a known-good free core. **keelblock's full claim must hold with nothing paid installed, and a gate asserts it.** |
| D-2 | **Supabase Auth**, not Better Auth                                                                 | 2026-09-07 | RLS policies key off `auth.uid()` from a Supabase-issued JWT. Keelblock's claim needs no bridge and no asterisk. Accepted cost: organizations, members, invitations and RBAC are keelblock's to build and test — a large share of v1 that Better Auth's organization plugin would have given free.                                                                                                   |

## Non-goals

Named because every one of these is a real complaint about existing kits, and _not doing them_ is a
feature:

- **Not a component library.** shadcn/ui is used; keelblock does not invent a design system to fight.
- **Not feature-maximal.** Supastarter ships five payment providers, an AI chatbot and i18n. That is
  their game and it is the bloat complaint. Keelblock ships one good path per concern.
- **Not a framework.** No `keelblock.config.ts` runtime, no plugin lifecycle, no abstraction over Next or
  Supabase. It is _your_ code from the first commit.
- **Not single-tenant B2C.** ShipFast is better at that and cheaper than free is worth.
- **No admin panel, no CMS** in v1. Clean seams, no pre-installed machinery.
- **No sub-teams.** Tenancy is two levels — organization, then member. A third (org → team → user,
  which Supajump ships) is a **documented extension point rather than a v1 feature**, decided in
  [ADR-001](adr/ADR-001-tenancy-model.md) and named here because "sub-team" is the word a buyer with
  departments searches for and ADR-001 does not use it. The cost is not the table; it is that every
  policy gains a second level to resolve, and every proof gains a dimension.
- ~~No i18n~~ — **corrected 2026-09-07 ([ADR-010](adr/ADR-010-internationalization.md)).** Grouping
  i18n with those two was a category error: they are _additive_, i18n is _pervasive_. Its retrofit
  moves every route and every link, so the cost scales with screen count — and keelblock had a single page.
  Shipped with a single locale, at the cheapest moment it will ever have.

## The enterprise surface — a recognized gap, not a non-goal

[BoxyHQ](https://github.com/boxyhq/saas-starter-kit) (4,928 stars, Apache-2.0) ships SAML SSO, SCIM
directory sync, audit logs, webhooks and API keys — and enforces tenant isolation with hand-written
application guards, with **zero** row-level security anywhere in its schema. That is the clearest
evidence for keelblock's thesis and, simultaneously, the clearest statement of what keelblock does not yet have.

**These are not non-goals.** keelblock targets multi-tenant B2B SaaS, and SSO, SCIM and audit logs are
exactly what a B2B buyer's security review asks for. Calling them out of scope would be convenient
rather than true, so they are registered as **DEF-005** (SSO) and **DEF-025** (SCIM) instead.

Two things worth taking from how BoxyHQ does it:

- **Delegate, do not build.** Their SSO is Jackson — now Ory Polis — audit logs are Retraced,
  webhooks are Svix. None
  of it is written from scratch, and that is the right instinct — an audit-log implementation in a
  starter kit is a liability its author will not maintain.
- **Read their feature list knowing the business model.** The kit is a funnel for its own SSO
  service — which, since the Ory acquisition, is **Ory Polis**, and Ory's README says the paid
  network's "SAML & SCIM ... are powered by Ory Polis". Free-and-enterprise-featured is
  distribution strategy, not generosity, and it explains which features got built first. It also
  means the funnel now points at somebody else's business, which is a maintenance question rather
  than a licence one (checked 2026-09-09).

The ordering keelblock keeps: **isolation proven, then the enterprise surface.** A kit with SSO and no
provable isolation is the arrangement the whole field already offers.

## The acceptance bar

"World-class" is unfalsifiable. These eleven are not. keelblock v1 is not done until every one is
demonstrably true, and each is owned by a SPEC.

| #    | Bar                                                                                                                                                                                                                   | How it is proven                                                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-1  | `npx create-keelblock-app` → running app with auth, an organization and a green test suite in **under 5 minutes** on a clean machine                                                                                  | A timed CI job that scaffolds from the published package and runs `npm run check`                                                                                                |
| B-2  | **Cross-tenant isolation is proven, not asserted** — every tenant-scoped table, every command, every identity                                                                                                         | Generated pgTAP suite + hand-written intent tests, in CI and nightly, with a published access matrix                                                                             |
| B-3  | **Nothing is more than one major behind**, and staleness fails the build                                                                                                                                              | The freshness gate: dated stamps that expire, checked offline so it cannot be dodged                                                                                             |
| B-4  | **Every "no X" promise has a gate, and every gate has a proof it can fail**                                                                                                                                           | Each gate ships a mutation test that restores the real defect and asserts red                                                                                                    |
| B-5  | **A stranger reaches their first deployed feature using only the docs**                                                                                                                                               | A scripted walkthrough run by someone with no prior context, timed and recorded                                                                                                  |
| B-6  | **Any optional subsystem is removable in one commit**                                                                                                                                                                 | A removal test per optional module: delete it, and typecheck + build + the remaining suite stay green                                                                            |
| B-7  | **Accessible**: keyboard-complete, axe-clean on every shipped surface                                                                                                                                                 | An automated axe pass in CI plus a manual keyboard walkthrough per surface                                                                                                       |
| B-8  | **Fast**: a performance budget that fails the build, not a Lighthouse screenshot                                                                                                                                      | Budget asserted in CI against the built app                                                                                                                                      |
| B-9  | **Secure by default**: CSP, security headers, rate limiting, secret scanning over full history                                                                                                                        | Header assertions in e2e; gitleaks in pre-commit and CI                                                                                                                          |
| B-11 | **Handover-ready**: someone who has never seen this repository — a new developer or a coding agent — can add a tenant-scoped feature correctly on their first attempt, and **prove it themselves without a reviewer** | A scripted trial: a fresh agent session and an unfamiliar developer each given one feature task and only the repository; measured on whether the gates catch what they get wrong |
| B-10 | **Upgradable**: a project scaffolded from keelblock `N` can adopt keelblock `N+1`'s security fixes by a documented, tested path                                                                                       | A CI job that scaffolds at the previous tag, applies the upgrade path, and runs the current suite green                                                                          |

B-6 is the direct answer to the field's loudest complaint — _"retrofitting the boilerplate's
implementation to your needs can be as complicated as implementing the feature from scratch."_ Most
kits treat their features as load-bearing. Keelblock treats **removability as a tested property**, which
is what makes an opinionated starter safe to adopt.

## Handover: the property nobody else can claim

Supastarter's first advertised feature is _"Codebase — AI-ready"_, and its headline is _"the SaaS
starter kit your coding agent deserves."_ Their offering is an `AGENTS.md`, monorepo structure and
end-to-end types — a **better map**.

keelblock's advantage is different in kind, and it is a by-product of everything already built:
**an agent working in keelblock cannot silently be wrong.**

An agent's characteristic failure is confident, plausible, incorrect code — and every gate here
targets exactly that class:

| The mistake an agent (or a tired developer) makes        | What catches it, immediately                          |
| -------------------------------------------------------- | ----------------------------------------------------- |
| adds a table, forgets row-level security                 | `schema` guard names the table                        |
| writes `with check (true)` because it compiles           | `schema` guard — `polwithcheck IS NULL` would not     |
| reaches for the service-role client to make a query work | `boundaries`, through the import graph, two hops deep |
| caches a tenant query                                    | `boundaries` — the cache key has no organization      |
| invents a message key                                    | `locale`                                              |
| leaves an unused export or dependency                    | `unused`                                              |
| claims a promise nothing implements                      | `promises`                                            |
| widens a permission                                      | the **access-matrix diff**, in the review             |

A map tells you where things are. **A gate tells you that you are wrong, in seconds, specifically.**
That is worth more to an agent than any amount of documentation, because it converts the review
bottleneck — a human reading generated code — into something the agent runs itself.

Same property, same value, for a human team: a new hire's first pull request is checked by the same
the gate suite instead of by a senior engineer's attention.

The bar is not nextacular. It is MakerKit ($349–649), Supastarter (€349–€1,499), Achromatic and
ShipFast ($199–299) — funded products with years of head start.

**Where keelblock does not compete, deliberately:** feature count and framework breadth. Supastarter ships
five payment providers, an AI chatbot, i18n and Nuxt/SvelteKit builds; MakerKit ships TanStack Start
and an Expo React Native kit. Matching that is their game, it is years of work, and it is the exact
bloat the field is criticized for. Keelblock ships one good path per concern.

**Where every one of them is weak, checked against their own material:**

| Axis                    | Field's state                                                                                                                                                                                                                                                                                                                                             | keelblock must                                                                              | Proof    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------- |
| **Proof of isolation**  | Nobody publishes a **result**. MakerKit "some tests", Supastarter journey e2e, ShipFast none — and [Basejump](https://github.com/usebasejump/basejump) ships a genuinely adversarial 13-file pgTAP suite (42 `throws_ok`, eight identities) that you must clone and run to learn anything from, with no matrix, no badge, and nothing showing it can fail | Prove it per table × command × identity, publish the matrix, and prove the suite can go red | B-2      |
| **Rot resistance**      | Stays current because a paid maintainer does it — a person, not a property                                                                                                                                                                                                                                                                                | Make staleness fail the build                                                               | B-3      |
| **Removability**        | The loudest complaint in every review; nobody solves it                                                                                                                                                                                                                                                                                                   | Make deleting a module a tested property                                                    | B-6      |
| **Upgradability**       | You cloned it in March; a security fix lands in September; there is no path                                                                                                                                                                                                                                                                               | Give a scaffolded project a tested route to upstream fixes                                  | **B-10** |
| **Verifiable promises** | Marketing claims, no mechanism                                                                                                                                                                                                                                                                                                                            | Every "no X" has a gate; every gate has a proof it can fail                                 | B-4      |
| **Price**               | $199–1,499                                                                                                                                                                                                                                                                                                                                                | Free, MIT                                                                                   | D-1      |

**B-10 is the one to lead with after isolation.** It is the deepest structural failure of the entire
boilerplate category: the product is a _copy_, so the moment you clone it you are forked off
maintenance forever. Every kit in the table has this problem and none advertises a solution, because
there isn't one — which is exactly why solving it is worth more than a sixth payment provider.

## Scope — one framework

**Next.js only.** No Nuxt, no SvelteKit, no TanStack Start, no React Native. That is the decision
that makes feature-completeness affordable rather than a slogan: Supastarter maintains the same
feature set across three frameworks and MakerKit across three targets, so **keelblock has roughly 3× the
budget per feature.** The offsetting cost is real and specific — every keelblock feature also needs
policies, intent tests, access-matrix rows and schema-guard compliance, call it 1.75× — so the net
advantage is real but not threefold. It is enough.

1. Marketing shell · 2. Auth (magic link, OAuth, passkeys, 2FA — **no password**, ADR-021) · 3. Account ·
2. Organizations · 5. Team & invitations · 6. Billing (Stripe: subscriptions, seats, usage) ·
3. Custom domains · 8. Ops & health · 9. **Transactional email** · 10. **File storage** ·
4. **Background jobs & cron** · 12. **Notifications** · 13. **Admin, user management &
   impersonation** · 14. **Audit log** · 15. **API keys** · 16. **Outbound webhooks** ·
5. **SEO & structured data** · 18. **Product analytics** · 19. **Local development**

Auth covers what the field's routes reveal as table stakes and specs often forget: email
verification, resend, and an organization switcher. **Password reset and account unlock are not on
that list, and that is a decision** — ADR-021 — not an omission: there is no password to reset, and
nothing to unlock when the only credential is a fresh link.

**SEO is a first-class area, not a `<meta>` tag** — canonical URLs, Open Graph, `JSON-LD`
structured data, a generated sitemap and robots policy, per-locale `hreflang` (i18n makes this
non-optional), and a **performance budget that fails the build** rather than a Lighthouse
screenshot. A marketing page that is fast and correctly described is worth more than a framework
change.

**Local development** means the loop actually works offline: the database, object storage, and a
mail catcher, so a developer sees the invitation email they just sent instead of a provider error.

**Product analytics** ships as one provider behind a seam, not a menu.

Plus the adoption layer: `create-keelblock-app` · docs · demo deployment · upgrade guides · onboarding
flow · legal pages · error monitoring · deployment guides.

### Refused deliberately, with reasons

Not "features we lack" — features whose cost is permanent and whose value is a comparison-table row.

**Read the first column carefully: three of these refuse a MENU, not a capability.** Payments,
analytics and data access are all in scope. What is refused is shipping several of each and
maintaining them forever, so that a buyer who chooses once can see a choice they will not make.

| Refused                           | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A menu of payment providers**   | Stripe is in scope (SPEC-007). Each additional provider is a webhook surface, a reconciliation path and its own edge cases, maintained for as long as the kit exists — and every one is a place a subscription can silently diverge from an entitlement. A team changes processor roughly never, and when it does the work is a migration, not a config flag.                                                                                                                                                                                                                                                       |
| **An ORM on the query path**      | Not a preference between Prisma and Drizzle. A client on a direct Postgres connection authenticates as a privileged role and **bypasses RLS unless explicitly configured** — true of both — so the default read path would step around the enforcement this product exists to provide, and the failure is silent (ADR-003). `supabase-js` carries the user's JWT, so RLS applies by construction rather than by remembering to configure it.                                                                                                                                                                        |
| **An example AI assistant**       | The hard part of putting an assistant in a multi-tenant app is not the SDK call, it is which rows it may read — and that is answered by the same policies as every other read, which this kit already proves. What an example adds is a model version, a prompt and a provider to keep current forever, in exchange for a screenshot. Nothing here stands in the way of adding one; it is simply not ours to maintain.                                                                                                                                                                                              |
| **A menu of analytics providers** | Analytics is in scope: one provider, behind a seam that is genuinely built and exercised (SPEC-029), so swapping it is a file rather than a fork. A menu is N integrations to keep current, N sets of docs, and N ways for the same event to end up named differently.                                                                                                                                                                                                                                                                                                                                              |
| **Feature flags**                 | MakerKit ships them. A flag system is a store, an evaluation path on the hot render path, and a per-tenant targeting model that has to answer to the same policies as everything else — and its real cost is the flags nobody removes, which become permanent branches in code and a combinatorial explosion nothing tests. What people actually need first is a per-environment constant, which is an environment variable, and per-tenant behaviour, which is entitlements and belongs to billing (SPEC-007). Neither needs a flag framework. Adding one later costs nothing, because there is no seam to unpick. |
| **A blog and a CMS**              | Nothing ships and **nothing is coupled to one** — that is the whole of the claim. Content modelling is where a starter's opinions age fastest and where teams least want inherited ones; most already have a CMS or will pick their own. There is deliberately no CMS abstraction either: an unexercised seam rots (ADR-002), so the kit stays free of the assumption rather than shipping an interface with nothing behind it. Adding yours costs nothing because there is nothing to unpick first.                                                                                                                |

### Why not Astro for the marketing pages

A reasonable question, and the answer is no — for the same reason keelblock is Next-only.

Astro's advantage is zero client JavaScript on content pages. Next 16 already prerenders keelblock's
landing fully static, so the ceiling is not the constraint. What a second framework _does_ add is a
second build system, a second dependency tree and **a second rot surface** — in a project whose
differentiator is that it does not rot. It also doubles what a buyer maintains forever, to save
milliseconds on a page whose job is to be found and read.

The concern underneath it is real and worth naming: **marketing pages must not read as generated
filler.** That is a content problem, and no framework fixes it. keelblock's answer is already built —
`FINDINGS.md`. Measured claims with reproductions are the opposite of filler, and no competitor can
publish them, because none of them did the measuring.

### Three borrowed features, and why keelblock's versions are different

BoxyHQ ships SSO, audit logs and webhooks — and **all three are third-party services**: Jackson
(now Ory Polis, and no longer their own product), Retraced, and Svix. Its Prisma schema contains no audit or webhook model at all.
A buyer gets integration code and three vendor relationships. That is a defensible choice, and
"delegate, do not build" is usually right — an audit-log implementation inside a starter is a
liability nobody maintains.

**It is the wrong choice for exactly three things, for one reason: they are tenant-isolation
surfaces, and isolation is what keelblock claims.**

| Feature               | Field's version                                                                                                                                                                                          | keelblock's version                                                                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **API keys**          | A credential fetched by id, then compared to a team in application code — **`getApiKeyById` is the source of [F-15](FINDINGS.md)**, the clearest illustration of the pattern keelblock exists to replace | A key resolves to an organization and role, and every query it makes is subject to the same policies as a session. The bypass route that an API key normally opens does not exist.                                      |
| **Audit log**         | Delegated to an external service, so the trail lives outside the isolation boundary the product claims                                                                                                   | Native and RLS-scoped, so **one tenant provably cannot read another's audit trail** — and it appears in `ACCESS-MATRIX.md` like everything else. Also a hard requirement for impersonation, which is already in scope.  |
| **Outbound webhooks** | Delegated for delivery, with payload scoping left to the caller                                                                                                                                          | Payloads scoped to the subscribing organization, proven by test. A webhook is a data-egress path; scoping it correctly is the same problem as a query, and it is the one place teams leak tenant data without noticing. |

Delivery infrastructure — retries, fan-out, signing at scale — stays a seam. Svix can sit behind it.
**What does not get delegated is the part that decides who sees what.**

### Impersonation is the interesting one

It **deliberately crosses the tenant boundary** — the only feature in the category that does. For a
kit whose whole claim is proven isolation it cannot be a superpower flag: it must be time-boxed,
audited, consented, and visible to the organization being impersonated. Nobody in the field does that.
It is the feature where keelblock's thesis produces a **visibly better answer rather than an equal one**.

## Definition of done for v1

- [ ] Every acceptance bar demonstrably met, each by its named artifact.
- [ ] Every SPEC `done`, or its gap covered by an open `DEF-*` with a machine-evaluable trigger.
- [ ] The gates green, and each gate's mutation proof passing.
- [ ] A published access matrix showing who can read and write what, per role, per table.
- [ ] Validation note: a developer with no context scaffolded, built something, and deployed it —
      recorded, with what confused them.
- [ ] Every shipped spec has a differentiator written up, or a recorded reason it has none — the
      `content` gate holds this, so the marketing surface cannot lag the product by a release.
