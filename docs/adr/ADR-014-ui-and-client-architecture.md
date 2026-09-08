# ADR-014: UI and client architecture

**Status:** Accepted · **Date:** 2026-09-08 · **Deciders:** owner, architect

## Context

keelblock has Tailwind and no components. Every choice below is load-bearing because a starter's UI
decisions are inherited wholesale and are expensive to reverse — and one of them, universal UI, is
_pervasive_ in the same sense i18n was, so it has to be decided now rather than discovered later.

## 1 · Universal UI (Tamagui, gluestack, React Native Web) — **no**

The argument for is real and I want to state it fairly: a universal component library is **pervasive,
not additive**. Adding it later means rewriting every component — the same shape as the i18n
reversal, where "decide it now while there is one page" was the right call.

It is refused anyway, and the difference from i18n is the arithmetic:

|                   | i18n                                | Universal UI                                                                                                               |
| ----------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Cost at this size | one route segment, one message file | a **different component library**, a build plugin, and every component thereafter written to the lowest common denominator |
| Ongoing cost      | a translation key per string        | more JavaScript on every web page, a less mature ecosystem, and a permanent constraint on what any component may do        |
| Who benefits      | most B2B SaaS, eventually           | only teams shipping a native app that **shares components**                                                                |

That last row is what decides it. Most B2B SaaS never ships a native app, and of those that do, most
do not want shared components anyway — **good mobile UX is not good web UX**, and teams that try to
share the view layer usually end up with an app that feels like a website.

**What a buyer needing mobile does instead:** write a React Native app against the same API. keelblock's
tenancy, policies, auth and billing serve it unchanged, because the guarantee lives in Postgres, not
in a component. That is a better answer than a shared button.

**Recorded as foreclosed deliberately**, not overlooked. Reversing it means replacing the component
layer, and this ADR is where that argument starts.

## 2 · shadcn/ui — **yes**, and the reason is not taste

It is **not a dependency**. Components are copied into the repository and owned outright: no package
version, no upgrade path, no breaking change to absorb, nothing to go stale. In a project whose
central differentiator is that it does not rot, a component library with **no version at all** is
uniquely aligned — and it happens to be built on Tailwind and Radix, which brings accessible
primitives that bar B-7 needs anyway.

## 3 · TanStack — **split, not adopted wholesale**

| Package    | Decision                                                                                                                                                                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Table**  | **Yes**, bound to the first data grid (SPEC-021, admin surfaces). Headless, unstyled, and a sortable filterable table is a surface every SaaS grows.                                                                                                                                                                 |
| **Query**  | **No.** It solves a problem React Server Components remove, and adopting it invites the client-fetch pattern ADR-011 deliberately forbids. A starter that ships both an RSC architecture and a client-cache library teaches two contradictory ways to load data, and the wrong one wins because it is more familiar. |
| **Form**   | No — see below.                                                                                                                                                                                                                                                                                                      |
| **Router** | No. Next has routing.                                                                                                                                                                                                                                                                                                |

## 4 · Forms — `useActionState` + zod, no form library

Server Actions with progressive enhancement are the framework's own answer, and they keep validation
on the server where ADR-011 puts it. `react-hook-form` pulls form state back to the client and
duplicates the schema.

**Trigger, not a promise:** if a form arrives that genuinely needs client-side field-level state —
a multi-step wizard, a dynamic array of rows — `react-hook-form` with the zod resolver is the
adoption, and it is a decision made against a real form rather than in advance.

## 5 · Charts — **none shipped**

Charts are _additive_ — bolt one on the day you need it, nothing existing changes — and the right
library depends entirely on the product. Apache ECharts is excellent and roughly a megabyte;
committing every buyer to that for a dashboard they may never build is precisely the bloat the field
is criticized for.

The documentation carries the choice criteria instead: **Recharts** for standard dashboards on this
stack, **ECharts** when you need heatmaps, correlation views, or a hundred thousand points. Twenty
minutes of work, made once, by the person who knows what they are plotting.

## 6 · Rate limiting — **ships with auth**, and it closes an unbacked claim

Bar B-9 has claimed _"CSP, security headers, rate limiting, secret scanning"_ since it was written.
Three of those exist. **Rate limiting exists nowhere** — the third instance in this project of a
promise written down with nothing behind it, after B-3 (freshness) and ADR-007 (Renovate).

It ships with SPEC-004, because auth endpoints are what need protecting and rate limiting an app with
no login protects nothing. **Postgres-backed** — keelblock already has a database and adding Redis to a
starter for a counter is infrastructure a buyer must then run forever — with a documented seam for
Upstash or Arcjet at a scale where a table stops being appropriate. Per-account lockout is separately
tracked as DEF-006.

## Consequences

**Positive:** the component layer has no version to rot, the data-loading story has exactly one
answer, and nothing heavy ships for a use case the buyer may not have.

**Negative:** shared-component React Native is foreclosed, and reversing it is a component-layer
rewrite. That is the cost of the decision, stated plainly rather than left to be discovered.
