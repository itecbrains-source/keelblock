# ADR-004: Rendering and caching — explicit `use cache`, tenant-scoped keys, enforced

**Status:** Accepted, **amended 2026-09-07 after smoke testing** (`research/04-SMOKE-RESULTS.md` S-3) · **Date:** 2026-09-07 · **Deciders:** architect

## Context

Next.js 16 replaces implicit App Router caching with **Cache Components**: everything is dynamic per
request unless explicitly marked `use cache`, paired with tag-based invalidation and PPR. Guidance is
to establish a central cache-tag registry early.

For a multi-tenant product this is not a performance topic, it is a **security** one. _A cached value
whose key omits the tenant is a cross-tenant data leak that RLS cannot prevent_ — the response is
served from cache and never reaches the database, so every policy keelblock is proud of is bypassed. This
is the one way to leak data that the entire B-2 apparatus would confirm as green.

## Decision Drivers

- Opt-in caching means the safe default (dynamic) is also the default.
- The dangerous case is narrow, mechanical, and therefore gateable.
- A starter's caching choices are inherited wholesale by every project built on it.

## Decision

**Chosen:** Cache Components enabled, with the amendment below.

**Amendment (measured, not predicted).** With `cacheComponents: true`, any Server Component reading
cookies fails the production build — and every authenticated Supabase read reads cookies. So enabling
Cache Components is not free: it forces a decision on **every authenticated route**. Verified outcomes:

- **`<Suspense>` around the tenant read is the default.** It builds, and the route becomes partially
  prerendered — static shell, streamed tenant data. A **standard authenticated page shell with a real
  fallback is therefore an architectural default**, not a style choice, and it makes _loading_ a state
  the framework forces you to design rather than an afterthought.
- `export const instant = false` is acceptable where nothing meaningful can be prerendered.
- **`"use cache"` over a session-dependent read is refused by Next itself** — `cookies()` inside a cache
  scope is a build error. The naive cross-tenant cache leak is therefore impossible, not merely
  discouraged.

**This narrows the gate rather than widening it.** The surviving risk is the escape hatch Next's own
error message recommends — read cookies outside, pass the value in as an argument. That is legitimate
and needed for per-org aggregates. So the gate checks the one thing that remains checkable: a
`use cache` function reaching tenant data takes its organization as an **argument** (which Next keys
on), never from closure or a default.

A central cache-tag registry still lands from the first commit.

## Consequences

**Positive:** the fastest path is also the safe one; caching decisions are visible in review; the leak
class that RLS cannot cover has a named owner.

**Negative:** a gate over `use cache` will have false positives on genuinely global cached values
(marketing copy, pricing tables). Mitigated by an explicit, reason-carrying, shrink-only allowlist —
the same pattern as every other keelblock gate, so there is one thing to learn rather than five.
