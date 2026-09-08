# SPEC-028: SEO & structured data

> Status: `draft` · Bars: **B-8** · Research: [`research/05-SEO-2026.md`](../research/05-SEO-2026.md) · ADRs: [004](../docs/adr/ADR-004-rendering-and-cache.md), [010](../docs/adr/ADR-010-internationalisation.md)

## Intent

Make every page keel serves **correctly described and fast** — for a ranker and, now equally, for an
extractor. The win condition moved from *rank the link* to *be the cited answer*: Google's AI Mode
passed a billion monthly users, and the same JSON-LD a search engine reads is what an LLM quotes.

This is primitives, not a marketing product. keel makes a page legible; what it says is the buyer's job.

## Scope / non-scope

- **In scope:** typed JSON-LD builders · canonical URLs · `hreflang` · Open Graph and Twitter cards ·
  generated sitemap and robots · an explicit AI-crawler policy · a performance budget that fails the
  build.
- **Out of scope, and named so it is a decision:** rank tracking · keyword tooling · content
  generation · **any claim that a primitive improves rankings.** Structured data is correctness
  hygiene, not a ranking lever, and implying otherwise is the marketing-claim honesty rule broken in
  the one area most prone to it.

## Requirements

### REQ-1 — JSON-LD is typed, so an invalid graph is a compile error
Builders for the five types a SaaS actually uses: `Organization`, `WebSite`, `SoftwareApplication`,
`BreadcrumbList`, `FAQPage`. Typed against schema.org so a missing required property fails at build
rather than surfacing as a Search Console warning three weeks later, when nobody remembers the change.

### REQ-2 — `FAQPage` and `HowTo` ship, and the docs say what they now do
FAQ rich results were **removed on 7 May 2026**. The markup is still worth emitting because it
packages content as question–answer pairs, which is the shape an LLM quotes. The documentation says
exactly this — **it earns no snippet and improves nothing in the blue links** — because the two
common wrong beliefs are that it is now pointless and that it still decorates.

### REQ-3 — every page declares a canonical URL
The most common self-inflicted SEO wound, and invisible until traffic splits.

### REQ-4 — `hreflang` is generated per locale, and is not optional here
keel ships i18n (ADR-010). **An internationalised site without `hreflang` competes with itself.**
Generated from the same locale list as the routing, so a new language cannot arrive without it.

### REQ-5 — sitemap and robots are generated from the route tree
Never hand-maintained. A hand-written sitemap is stale the first time someone adds a page, and its
staleness is silent.

### REQ-6 — the AI-crawler policy is an explicit decision with one place to change it
`GPTBot`, `ChatGPT-User`, `PerplexityBot`, `ClaudeBot`, `Google-Extended` and peers are **allowed by
default** — a SaaS wants to be cited — with a single documented switch to refuse, per-crawler.
A default nobody chose is the wrong default whichever way it points.

### REQ-7 — `llms.txt` is available and honestly labelled
Emitted on request, and documented as **an emerging convention with mixed adoption and no confirmed
Google signal**. Shipping it silently as established practice would be the same overclaim REQ-2
guards against.

### REQ-8 — a performance budget fails the build
Core Web Vitals asserted against the built application, not a Lighthouse screenshot attached to a
pull request. A budget that does not fail is a preference.

### REQ-9 — social preview images are generated, not hand-made
Per-page Open Graph images from the framework's image generation, so a new page cannot ship with the
previous page's picture — a failure nobody notices until a link is shared.

## Acceptance criteria

| AC | Verifies | Method | Evidence | Status |
|----|----------|--------|----------|--------|
| AC-1 | REQ-1 | test | `src/lib/seo/json-ld.test.mts` — each builder emits a valid graph; a missing required property fails to typecheck | planned |
| AC-2 | REQ-2 | test | the docs assert the no-snippet caveat; a rendered `FAQPage` parses as valid JSON-LD | planned |
| AC-3 | REQ-3 | test | every route in the manifest emits exactly one canonical | planned |
| AC-4 | REQ-4 | test | `hreflang` is emitted for every configured locale, derived from `routing.locales`; adding a locale without one fails | planned |
| AC-5 | REQ-5 | test | the sitemap contains every public route and no private one — **a sitemap that lists an authenticated route is a disclosure bug** | planned |
| AC-6 | REQ-6 | test | the policy is honoured per crawler; a mutation flipping one to disallow is caught | planned |
| AC-7 | REQ-7 | test | `llms.txt` renders, and the documentation carries the honest caveat | planned |
| AC-8 | REQ-8 | test | the budget fails the build when a threshold is exceeded (mutation-proven with an inflated bundle) | planned |
| AC-9 | REQ-9 | test | each page produces its own OG image; a missing one is a build failure, not a fallback | planned |

## Definition of Done

- [ ] Every REQ `done` with its AC passing, or a valid `DEF-*`.
- [ ] **No claim anywhere that a primitive here improves rankings.** Asserted by the copy tests.
- [ ] Structured data validated against Google's Rich Results Test and schema.org, and the run recorded.
- [ ] The research memo re-verified on the date of build — this area moves fast enough that a
      six-month-old SEO memo is a liability.
