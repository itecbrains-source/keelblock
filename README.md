# keel

A multi-tenant SaaS starter. The spine you lay down first; everything else is built onto it.

**Status:** seeded, not scaffolded. The architecture is decided ([LESSONS.md](LESSONS.md)); no application code yet.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16, App Router, React 19 | Current; server components by default |
| Language | TypeScript, strict | — |
| Data + auth | Supabase (Postgres) | **RLS is the tenant boundary** — the reason this is not a Prisma template |
| Payments | Stripe (subscriptions + webhook) | — |
| Styling | Tailwind v4 + shadcn/ui | — |
| Tests | Vitest · pgTAP · Playwright | Present from commit 1, not retrofitted |

## What this is not

It is not a fork of [nextacular](https://github.com/nextacular/nextacular). That project is Next 13.5 / Pages Router,
has zero tests, and enforces tenant isolation with an application-layer helper each API route must remember to call.
A starter whose isolation is *"remember to call the helper"* ships the bug class in the first commit.

A read-only clone lives at `../nextacular` and is mined for its Stripe subscription plumbing, magic-link
auth flow, workspace/member/invite data model, and custom-domain handling. Nothing is copied without
being re-grounded against the rules in [LESSONS.md](LESSONS.md).

## Layout (planned)

```
src/app/          App Router surfaces
src/lib/          pure logic — no I/O, unit-tested
supabase/         migrations + RLS policies + pgTAP suites
e2e/              authed Playwright flows
scripts/          the gates (npm run check)
```
