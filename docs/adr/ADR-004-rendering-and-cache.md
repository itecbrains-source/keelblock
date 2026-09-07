# ADR-004: Rendering and caching — explicit `use cache`, tenant-scoped keys, enforced

**Status:** Accepted · **Date:** 2026-09-07 · **Deciders:** architect

## Context

Next.js 16 replaces implicit App Router caching with **Cache Components**: everything is dynamic per
request unless explicitly marked `use cache`, paired with tag-based invalidation and PPR. Guidance is
to establish a central cache-tag registry early.

For a multi-tenant product this is not a performance topic, it is a **security** one. *A cached value
whose key omits the tenant is a cross-tenant data leak that RLS cannot prevent* — the response is
served from cache and never reaches the database, so every policy keel is proud of is bypassed. This
is the one way to leak data that the entire B-2 apparatus would confirm as green.

## Decision Drivers

- Opt-in caching means the safe default (dynamic) is also the default.
- The dangerous case is narrow, mechanical, and therefore gateable.
- A starter's caching choices are inherited wholesale by every project built on it.

## Decision

**Chosen:** Cache Components enabled; **nothing tenant-scoped is cached without the organisation id in
its cache key or tag**; a central tag registry from the first commit; a gate that fails the build on a
`use cache` in a tenant-scoped module whose key or tag does not include the organisation.

## Consequences

**Positive:** the fastest path is also the safe one; caching decisions are visible in review; the leak
class that RLS cannot cover has a named owner.

**Negative:** a gate over `use cache` will have false positives on genuinely global cached values
(marketing copy, pricing tables). Mitigated by an explicit, reason-carrying, shrink-only allowlist —
the same pattern as every other keel gate, so there is one thing to learn rather than five.
