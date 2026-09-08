# Field scan — what already exists, and where the gap actually is

*Researched 2026-09-07. Every claim below is sourced; re-verify before acting on it, because this
field moves and a stale competitive read is worse than none.*

## The market is paid

| Kit | Price | Stack | Multi-tenant | Tests | Open |
|---|---|---|---|---|---|
| **MakerKit** | $349–649 (free OSS lite) | Next 16, React 19, Supabase, **Drizzle**, **Better Auth** | yes, hybrid personal/team | some | no |
| **Supastarter** | €349–€1,499 | Next / Nuxt / SvelteKit | yes, "deep" | **Playwright e2e** | no |
| **ShipFast** | $199–299 | Next, minimal | no — single-tenant B2C | no | no |
| **Achromatic** | paid | Next | yes | — | no |
| **`nextjs/saas-starter`** | free | Next 16, Postgres, **Drizzle**, shadcn/ui | owner/member roles | no | yes |
| **BoxyHQ** | free | Next 15.5, **Pages Router**, Prisma, NextAuth + SAML Jackson | teams, **app-layer only** | 1 unit file + Playwright e2e | **yes, Apache-2.0** |
| **nextacular** | free | Next **13.5**, Pages Router, Prisma, NextAuth 4 | workspaces, app-layer only | **zero** | yes |

**Correction to this memo (2026-09-07):** the original scan missed
[BoxyHQ](https://github.com/boxyhq/saas-starter-kit) — 4,928 stars, 1,228 forks, 30 contributors,
Apache-2.0. It is the most-starred free option in the category and by far keel's closest competitor,
and omitting it made the "no free option exists" claim look easier than it is. Recorded here rather
than quietly fixed.

**It does not weaken the thesis — it is the strongest evidence for it.** BoxyHQ ships SAML SSO,
SCIM directory sync, audit logs, webhooks and API keys, and enforces tenant isolation with
hand-written application guards:

```ts
export const throwIfNoAccessToApiKey = async (apiKeyId: string, teamId: string) => {
  const apiKey = await getApiKeyById(apiKeyId);
  if (teamId !== apiKey.teamId) throw new ApiError(403, '…');
};
```

A grep for `create policy` / `row level security` across its schema and lib returns **zero matches**.
So the most successful free enterprise SaaS starter in the category — five thousand stars, a
thousand forks — has **no database-enforced tenant isolation at all**, and one unit test file, with
its entire safety net in Playwright.

Its business model also explains its shape: the kit is a funnel for Jackson, BoxyHQ's own SSO
product. Free and enterprise-featured is a distribution strategy, not charity — worth knowing before
reading its feature list as a bar to match.

The free options define the gap precisely:

- **`nextjs/saas-starter`** is deliberately minimal and its README *points users at the paid kits*. It
  uses email+password JWTs in cookies, Drizzle, and Postgres — **not Supabase, and not RLS.**
- **nextacular** is the right idea, unmaintained in substance.

So: **there is no free, open, tested, Supabase-native, RLS-proven multi-tenant starter.** That is
the hole, and it is a real one — not a story told to justify building. Four thousand nine hundred
stars have accumulated on a kit whose isolation is a function call each route must remember.

**What BoxyHQ is better at, and keel should not pretend otherwise:** enterprise surface (SSO, SCIM,
audit logs, webhooks, API keys — all *delegated to services* rather than built, which is the right
instinct), i18n done properly, dead-code detection via `knip`, page-object fixtures in its e2e
suite, and — the hardest thing to copy — distribution: 30 contributors and a thousand forks.

## What the field is criticised for

Consistent across every independent comparison, and these are keel's design constraints, not
marketing copy:

1. **Bloat** — features you did not want, that you now maintain.
2. **Inflexibility** — *"starting in someone else's code and style is off-putting"*; retrofitting the
   kit's implementation to your need can cost more than writing it yourself.
3. **Untested** — *"a tangled mess of untested, unscalable code that leads you in the totally wrong
   direction."*
4. **The stated gap, verbatim:** *"multi-tenancy, enterprise auth, and audit-grade security are not
   what these tools produce out of the box — they produce a starting point, not a production
   enterprise system."*

Point 4 is the thesis. Points 1–3 are the constraints that stop keel becoming what it replaces.

## What this implies

- Competing on **feature count** is losing — Supastarter already ships five payment providers, an AI
  chatbot and i18n. Feature-count is their game and it is the bloat complaint.
- Competing on **provable correctness of the thing everyone gets wrong** is winnable, unoccupied, and
  matches what buyers say is missing.
- Being **free and open** against a $349–1,499 field is a genuine wedge, but only if the quality
  claim survives inspection — a free kit that is merely cheaper is nextacular again.

## Deliberately not lifted from BoxyHQ

Naming these so the choice is a decision rather than an oversight:

- **i18n and `check-locale`.** A real cost for a speculative benefit in a starter; already a stated
  non-goal, and their locale gate only earns its keep once i18n exists.
- **The enterprise feature set.** Registered as DEF-005, not copied — and the ordering stands:
  isolation proven, then table stakes.
- **Page-object boilerplate.** The *pattern* is settled (SPEC-002 REQ-3b); the code gets written when
  there is a flow to drive, not before.
- **Their RBAC matrix shape.** SPEC-001 REQ-7 already specifies a role model pinned across TypeScript
  and SQL. Theirs is a good confirmation of the shape, not a new idea to import.

**Taken:** the accessible-locator rule (SPEC-002 REQ-3b) and the fetch-then-check contrast
([F-15](../docs/FINDINGS.md)), which is the clearest illustration of keel's thesis anyone has written,
including us.

## Sources

**Primary** — each project's own repository, documentation or pricing page. Everything load-bearing
here (stack, tenancy mechanism, test presence, price) was read from the source, not from a review:

- [boxyhq/saas-starter-kit](https://github.com/boxyhq/saas-starter-kit) · cloned and read: `models/`, `lib/guards/`, `prisma/schema.prisma`, `.github/workflows/`
- [nextacular/nextacular](https://github.com/nextacular/nextacular) · cloned and read
- [Vercel — Next.js SaaS Starter](https://vercel.com/templates/next.js/next-js-saas-starter)
- [supastarter.dev](https://supastarter.dev) · feature list and pricing, read directly
- [MakerKit](https://makerkit.dev) · pricing and stack, read directly

**Secondary** — comparison write-ups, several vendor-authored. Used to find candidates, never to
establish a fact about one:

- [MakerKit — best Next.js SaaS boilerplates](https://makerkit.dev/blog/saas/best-nextjs-saas-boilerplate) *(vendor-authored; read for its own positioning)*
- [StarterPick — supastarter vs makerkit vs ixartz vs shipfast](https://starterpick.com/guides/supastarter-vs-makerkit-vs-ixartz-vs-shipfast-2026)
- [buildmvpfast — best SaaS boilerplate 2026](https://www.buildmvpfast.com/blog/best-saas-boilerplate-starter-kit-2026-nextjs)
- [SaaS Pegasus — boilerplates and starter kits](https://www.saaspegasus.com/guides/saas-boilerplates-and-starter-kits/) *(the bloat/inflexibility critique)*
- [Vercel — Next.js SaaS Starter](https://vercel.com/templates/next.js/next-js-saas-starter)
