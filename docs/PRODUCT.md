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
- **No i18n, no admin panel, no CMS** in v1. Clean seams, no pre-installed machinery.

## The acceptance bar

"World-class" is unfalsifiable. These six are not. keel v1 is not done until every one is
demonstrably true, and each is owned by a SPEC.

| # | Bar | How it is proven |
|---|---|---|
| B-1 | `npx create-keel-app` → running app with auth, an organisation and a green test suite in **under 5 minutes** on a clean machine | A timed CI job that scaffolds from the published package and runs `npm run check` |
| B-2 | **Cross-tenant isolation is proven, not asserted** — every tenant-scoped table, every command, every identity | Generated pgTAP suite + hand-written intent tests, in CI and nightly, with a published access matrix |
| B-3 | **Nothing is more than one major behind**, and staleness fails the build | The freshness gate: dated stamps that expire, checked offline so it cannot be dodged |
| B-4 | **Every "no X" promise has a gate, and every gate has a proof it can fail** | Each gate ships a mutation test that restores the real defect and asserts red |
| B-5 | **A stranger reaches their first deployed feature using only the docs** | A scripted walkthrough run by someone with no prior context, timed and recorded |
| B-6 | **Any optional subsystem is removable in one commit** | A removal test per optional module: delete it, and typecheck + build + the remaining suite stay green |

B-6 is the direct answer to the field's loudest complaint — *"retrofitting the boilerplate's
implementation to your needs can be as complicated as implementing the feature from scratch."* Most
kits treat their features as load-bearing. Keel treats **removability as a tested property**, which
is what makes an opinionated starter safe to adopt.

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
