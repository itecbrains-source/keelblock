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
| **nextacular** | free | Next **13.5**, Pages Router, Prisma, NextAuth 4 | workspaces, app-layer only | **zero** | yes |

The two free options define the gap precisely:

- **`nextjs/saas-starter`** is deliberately minimal and its README *points users at the paid kits*. It
  uses email+password JWTs in cookies, Drizzle, and Postgres — **not Supabase, and not RLS.**
- **nextacular** is the right idea, unmaintained in substance.

So: **there is no free, open, tested, Supabase-native, RLS-proven multi-tenant starter.** That is
the hole, and it is a real one — not a story told to justify building.

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

## Sources

- [MakerKit — best Next.js SaaS boilerplates](https://makerkit.dev/blog/saas/best-nextjs-saas-boilerplate) *(vendor-authored; read for its own positioning)*
- [StarterPick — supastarter vs makerkit vs ixartz vs shipfast](https://starterpick.com/guides/supastarter-vs-makerkit-vs-ixartz-vs-shipfast-2026)
- [buildmvpfast — best SaaS boilerplate 2026](https://www.buildmvpfast.com/blog/best-saas-boilerplate-starter-kit-2026-nextjs)
- [SaaS Pegasus — boilerplates and starter kits](https://www.saaspegasus.com/guides/saas-boilerplates-and-starter-kits/) *(the bloat/inflexibility critique)*
- [Vercel — Next.js SaaS Starter](https://vercel.com/templates/next.js/next-js-saas-starter)
