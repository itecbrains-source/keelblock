# Parity target — a better nextacular

Keel matches [nextacular](https://github.com/nextacular/nextacular)'s feature surface (37 routes,
8 areas, enumerated from its `src/pages` tree) and differs only where nextacular's approach is the
thing that costs you later. **"Better" is defined here, not asserted.**

## The eight areas

| # | Area | nextacular | keel |
|---|---|---|---|
| 1 | Marketing | `/`, `sitemap.xml` | same, plus static-first and a real 404/500 |
| 2 | Auth | NextAuth v4 + Prisma adapter, magic link + OAuth | Supabase Auth, magic link + OAuth, **session read server-side** |
| 3 | Account | list, settings (name/email), billing, payment | same |
| 4 | Workspace | dashboard + settings: general / team / domain / advanced | same |
| 5 | Team | invite · accept · decline · join · remove · role | same, **every mutation a Server Action, not 7 API routes** |
| 6 | Billing | Stripe checkout by priceId + webhook | same, plus **customer portal** and idempotent webhook |
| 7 | Custom domains | add / check / remove, `_sites/[site]` rendering | same, via middleware rewrite |
| 8 | Ops | `/api/ping` | `/api/health` + `/api/health/deep` (reports migration head) |

## The eight differences that are the point

1. **RLS is the tenant boundary.** nextacular calls `requireWorkspaceMember()` in each API route by
   convention; miss it once and there is nothing behind it. Keel enforces isolation in Postgres and
   proves it with a probe that enumerates every tenant-scoped table and attempts a read as the wrong
   tenant. The app-layer guard stays — as defence in depth, never as the boundary.
2. **Tests exist.** nextacular ships zero. Keel ships unit + pgTAP + one authed Playwright flow, and
   `npm run check` runs all three.
3. **App Router / React 19 / Server Actions**, not Pages Router + 23 hand-rolled API routes. Mutations
   get CSRF for free and live next to the UI that calls them.
4. **Honest states.** Every data surface distinguishes `loading | empty | error | ready`. A failed
   fetch never renders as an empty list or a zero.
5. **Migrations are safe with the old code running.** Additive by default; a drop or rename ships
   schema-first, code-after. A drift check compares each environment against the repo.
6. **Secrets are never a plaintext column** — vault reference or one-way hash, checked by a gate.
7. **Money is integer cents** on one canonical path. Displays are views of it, never re-computations.
8. **Every "no X" promise has a gate behind it**, and every gate has a proof that it can fail.

## Deliberately not carried over

- **i18n** (`i18next` + `react-i18next`) — real cost, speculative benefit for a starter. The seam is
  left clean so it can be added; the machinery is not pre-installed.
- **Prisma** — an ORM whose idiom is app-layer filtering works against difference #1.
- `swr` — Server Components remove most of what it was doing.
