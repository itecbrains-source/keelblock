# SPEC-015: Accessibility & performance budgets

> Status: `partial` · Bars: **B-7**, **B-8** · Research: [`research/17-ACCESSIBILITY-AND-BUDGETS.md`](../research/17-ACCESSIBILITY-AND-BUDGETS.md) · ADRs: [019](../docs/adr/ADR-019-documentation-timing.md)
> Contracts: ·

## Intent

Every rendered surface is checked for accessibility on every push, and **the check states its own
coverage** rather than implying it. After this, "accessible" stops being a word in a bar and becomes a
method with a number attached: an automated pass that finds most issues by volume and roughly a fifth
to a third of the success criteria, plus a human walkthrough that is the majority of the work.

The same move applies to speed. A budget that can be measured here is a **lab** budget, and Core Web
Vitals are a **field** measurement this project has no field for. Saying which one a number is, is the
whole requirement.

## Scope / non-scope

- **In scope:** an automated accessibility pass over every rendered surface, on every push, whose
  ruleset and coverage are declared; a stated bound on what that pass proves; the keyboard
  walkthrough's protocol and its record; a lab performance budget that fails the build when crossed.
- **Out of scope, and named so it is a decision:**
  - **Core Web Vitals as a claim.** They are defined on real users at the 75th percentile over a
    28-day window (memo 17). keelblock has no users (DEF-001), so there is no p75 of anything. Not
    deferred to a date — DEF-034, whose trigger is the event rather than a calendar.
  - **Accessibility of surfaces that do not exist.** This spec covers what is rendered today and
    fails when a new surface arrives without saying how it is reached; it does not describe surfaces
    SPEC-008 will add.
  - **Screen-reader conformance testing.** A different method, a different cost, and a claim nobody
    here can currently support. It is not in B-7's wording and it is not smuggled in.
  - **Performance of the database layer.** SPEC-002's probes and the policy suite own query cost.
    This spec is about what a browser does with what it is sent.

## Sources of truth

- `research/17-ACCESSIBILITY-AND-BUDGETS.md` — the coverage arithmetic, the standard's status, and
  why a lab number is not a field one
- `docs/PRODUCT.md` — B-7 and B-8 as written
- `e2e/journeys/accessibility.spec.ts` — the pass that already exists
- `docs/FINDINGS.md` — F-90 (the surface count grew before the evidence did), F-91 (the first version
  of that pass scanned the shell)

## Requirements

### REQ-1 — every rendered surface is scanned, and the list of surfaces is derived

A hand-listed set of URLs is correct on the day it is written and silently incomplete afterwards —
F-77 spent three commits removing that shape, and F-90 is the same failure in the other direction: the
surface count grew while its evidence did not. The list of surfaces comes from the route tree; what a
person supplies is only **how to reach** each one, because that is the part a walker cannot know.

Without this, a page added on a Tuesday is unscanned forever and nothing says so.

### REQ-2 — the scan proves it looked at the rendered surface, not at its shell

MEASURED (F-91): every session-dependent region renders inside `<Suspense>` (ADR-004), so the shell
flushes before the content exists. The first version of this pass waited for a heading — which is in
the shell — and reported five surfaces clean while scanning empty pages. A planted `<img>` with no
`alt` failed on the static sign-in page and **passed** on the streamed one.

So each scan names something inside the boundary and refuses to run until it is visible. Without this
the suite is green by construction, which is worse than absent because it is believed.

### REQ-3 — the ruleset is declared, and "axe-clean" is never written as "accessible"

MEASURED (memo 17, Deque's own study over 13,000+ pages and ~300,000 issues): automation finds about
**57% of issues by volume** — a figure Deque explicitly redefined away from the share of success
criteria automation can test, **traditionally cited at 20–30%**. The second number is the one a
conformance claim depends on and it is the smaller one.

The bar therefore states its ruleset by name and its coverage as a bound. A spec that says "accessible"
on the strength of a green axe run has asserted the larger number for a question that takes the
smaller one.

### REQ-4 — the standard's version is a stated position with a trigger, not an assumption

MEASURED (memo 17): **EN 301 549 v4.1.1**, published **2 September 2026**, adopts WCAG 2.2. It is
**not** the legal reference — until the European Commission cites it in the Official Journal, the
reference remains v3.2.1 (2021), which is **WCAG 2.1 Level AA**.

So the tag set is right today and will be wrong, and no source publishes a date. A calendar reminder
would be a guess; the trigger is the citation. Without this the project holds a position it did not
choose and will lose without noticing.

### REQ-5 — the keyboard half is performed by a person, and its absence is visible

B-7's evidence is "an automated axe pass in CI **plus a manual keyboard walkthrough per surface**".
Memo 17's arithmetic is why that is not a courtesy: most success criteria are not machine-checkable at
all. A bar that ships only the half a machine can do, and does not say so, is claiming the other half.

### REQ-6 — a performance number says whether it is lab or field

MEASURED (memo 17): Core Web Vitals are assessed at the **75th percentile of real user data** from
CrUX over a **28-day rolling window**; LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. INP replaced FID on
12 March 2024.

A Lighthouse-class number is one synthetic run on one machine. It is a useful regression signal and it
is not Core Web Vitals. The failure this prevents is the ordinary one: a README quoting a lab score in
the vocabulary of a field measurement, which is a field result asserted by a machine that had no field.

## Acceptance criteria

| AC   | Verifies | Method | Evidence                                                                                                                                                                                                                                                               | Status   |
| ---- | -------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-1 | REQ-1    | test   | `e2e/journeys/accessibility.spec.ts` — surfaces derived from the route tree by `readdirSync` over `src/app`; a page with no entry in `HOW_TO_VISIT` fails, and an entry naming a page that no longer exists fails too                                                  | **done** |
| AC-2 | REQ-2    | test   | `e2e/journeys/accessibility.spec.ts` — each scan names a locator inside the Suspense boundary and refuses to scan until it is visible; proven by planting `image-alt` and a missing label on the projects surface, which passed before the guard and fail after (F-91) | **done** |
| AC-3 | REQ-3    | test   | `e2e/journeys/accessibility.spec.ts` — the tag list is a named constant with `best-practice` excluded and the reason attached; `docs/PRODUCT.md` states the coverage bound rather than the word "accessible"                                                           | planned  |
| AC-4 | REQ-4    | test   | `spec/DEFERRAL_REGISTRY.md` DEF-033 records the position and why it is `decided:` rather than `date:`; still open is a check that the shipped tag set matches it, so a silent edit of either cannot pass                                                               | planned  |
| AC-5 | REQ-5    | test   | the keyboard walkthrough performed and recorded per surface — a person, and not claimable by this spec alone                                                                                                                                                           | planned  |
| AC-6 | REQ-6    | test   | a lab budget that fails the build when crossed, whose output names itself as a lab measurement                                                                                                                                                                         | planned  |

## Definition of Done

- [ ] Every REQ `done` with its AC passing, or covered by an open `DEF-*` with a machine-evaluable trigger.
- [ ] Cheap gates green: `npm run check`.
- [ ] The research memo re-verified on the date of build. Memo 17 is registered `fast` deliberately:
      the OJEU citation could land in any month and would change REQ-4's answer.
- [ ] **Written up.** A `differentiators` entry in `docs/content/MANIFEST.json`.
- [ ] The keyboard walkthrough run at least once, with its record filed and its coverage stated in
      the same sentence as its result.

## Deferrals

**DEF-033** — the WCAG 2.2 move (REQ-4), which waits on an event nobody in this repository can watch.
Its trigger is `decided:` rather than `date:` because no source publishes a timeline; what actually
schedules the look is memo 17's own `fast` window, since re-verifying the memo means reading the
citation status.

**DEF-034** — the field half of REQ-6, which waits on the product having users at all — the same wall DEF-001 and
Theme 4 of the external review of 2026-09-10 describe.

**This spec inherits evidence rather than starting from nothing.** AC-1 and AC-2 were built before it
existed, in `d681687`, and ran unclaimed against a spec that did not exist — which is the state F-90
recorded and this file ends.
