# Accessibility and performance budgets — what can be claimed, and what cannot

Research memo for **SPEC-015** (accessibility & performance budgets), which owns **B-7** and half of
**B-8** and is not yet authored. Written before the spec, per `AGENTS.md`: a spec written from
recollection encodes whatever was true when its author last looked, and this is an area that moved
**sixteen days ago**.

The short version: **both halves of this spec are about the gap between what a machine can measure and
what the bar actually claims.** Automation finds a majority of accessibility issues and not all of
them; Core Web Vitals are a field measurement and this project has no field. A spec that ignores
either gap will assert something it has not got.

---

## What is settled

### Automation finds most accessibility issues by VOLUME — not most success criteria

Deque's own study, on first-time audits:

> 57 percent of digital accessibility issues

across **over 2,000 audits, 13,000+ pages, nearly 300,000 issues**, using the open-source `axe-core`
rules library.

**The number is a redefinition and citing it without that is misleading.** Deque says so explicitly:
the figure shifts the question _from_ the share of WCAG success criteria that automation can test —
**traditionally cited at 20–30%** — _to_ the share of real-world issues actually detected. Those are
different denominators and they answer different questions.

So, precisely:

- **~57% of issues found in practice** — the number to use when asking "how much does running axe buy
  me".
- **~20–30% of success criteria** — the number to use when asking "can automation tell me I conform".

The second is the one a bar depends on, and it is the smaller one.

Deque also states that `axe-core` "places a huge emphasis on not reporting false positives", which is
why its number is quotable at all: a tool that guesses would produce a larger and worthless figure.

**Consequence for the spec: "axe-clean" must never be written as "accessible".** A page can pass every
automated rule and be unusable by keyboard, and the keyboard walkthrough B-7 already names is not
decoration — it is the majority of the criteria.

### WCAG 2.2 is current; WCAG 2.1 AA is still what the law points at

- **WCAG 2.2** became a W3C Recommendation on **5 October 2023**.
- **EN 301 549 v4.1.1** was published **2 September 2026** and adopts **WCAG 2.2**, replacing 2.1. It
  adds six requirements and removes the obsolete **4.1.1 Parsing** criterion.
- **It is not the legal reference yet.** Until the European Commission formally cites v4.1.1 in the
  **Official Journal of the European Union**, the reference remains **EN 301 549 v3.2.1 (2021)**,
  which is based on **WCAG 2.1 Level AA**. Once cited, v4.1.1 gives "presumption of conformity" with
  both the European Accessibility Act and the Web Accessibility Directive.
- The **European Accessibility Act** has been enforceable since **June 2025**.

**Consequence for the spec:** the axe tag set shipped in `e2e/journeys/accessibility.spec.ts`
(`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`) is the correct bar **today** and has a **scheduled
change with no date attached**. That is a deferral-shaped fact, not a TODO.

### Core Web Vitals are a field measurement, at the 75th percentile, over 28 days

| metric  | good     | poor     |
| ------- | -------- | -------- |
| **LCP** | ≤ 2.5 s  | > 4 s    |
| **INP** | ≤ 200 ms | > 500 ms |
| **CLS** | ≤ 0.1    | > 0.25   |

- Assessed at the **75th percentile of real user data**, from the **Chrome User Experience Report**,
  over a **28-day rolling window**. Thresholds are identical on mobile and desktop.
- **INP replaced FID** as a Core Web Vital on **12 March 2024**.

---

## What is contested, or simply unknown

### When WCAG 2.2 becomes the bar — nobody publishes a date

The OJEU citation is the trigger and no source gives a timeline. This cannot be researched into
certainty; it can only be watched. A spec that writes "we target WCAG 2.2" today is claiming a bar the
law does not yet ask for; one that writes "2.1 AA" without noting the change is describing a position
it will lose without noticing.

**The honest shape is a dated re-check, not a choice.**

### Whether this project can claim Core Web Vitals at all — it cannot, today

This is the finding that should shape the performance half, and it is uncomfortable.

**Core Web Vitals are defined on real users.** keelblock has none (DEF-001 records that nobody has used
the product), no deployed instance with traffic, and therefore **no CrUX data and no p75 of anything**.

A Lighthouse or `next build` number is a **lab** measurement: one synthetic run, one simulated network,
one machine. It is a useful regression signal and it is **not** Core Web Vitals. The two are routinely
conflated, and a bar that quotes lab numbers as CWV is asserting a field result from a machine that
had no field.

So there are exactly two honest options for B-8's performance half, and choosing between them is the
spec's job:

1. **A lab budget, labelled as one** — assert bundle size and a Lighthouse-class metric as a
   regression gate, and state plainly that it predicts CWV rather than measuring it.
2. **Defer the field half** until a deployed instance has traffic, with a trigger that names the
   event rather than a date.

Option 1 is buildable now and is worth less than it looks. Option 2 is honest and builds nothing. The
spec should probably do both: ship 1, defer 2, and never let 1 be described in the words of 2.

### Whether `best-practice` rules belong in the bar

`e2e/journeys/accessibility.spec.ts` excludes axe's `best-practice` tag with a stated reason — those
rules are opinionated rather than normative. Nothing in the sources contradicts that, and nothing
endorses it either: it is a project decision, correctly recorded as one, and this memo does not
upgrade it into a finding.

---

## What this means for SPEC-015, before anyone writes it

1. **The bar cannot be "axe-clean".** It has to name the method and its coverage — roughly a fifth to
   a third of success criteria are machine-checkable at all.
2. **The keyboard half is the majority of the work**, not a courtesy. B-7 already says so; the memo
   confirms the arithmetic behind it.
3. **The tag set has a scheduled change with no date**, so it wants a deferral with a real trigger —
   "EN 301 549 v4.1.1 is cited in the OJEU" — rather than a calendar reminder.
4. **Performance cannot be claimed as Core Web Vitals** and can be claimed as a lab budget. Those are
   different sentences and the spec must use the right one.
5. **The axe pass already exists, is proven able to fail, and runs on every push** (`d681687`,
   F-91). SPEC-015 inherits evidence rather than starting from nothing — which is the unusual part of
   authoring it, and the reason it was picked.

---

## Sources

**Primary**

- [Deque — Automated testing identifies 57% of digital accessibility issues](https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues/) —
  the study, its dataset, and its explicit redefinition away from success-criteria coverage
- [Deque — The Automated Accessibility Coverage Report](https://www.deque.com/automated-accessibility-coverage-report/) —
  the report the figure comes from
- [W3C WAI — WCAG 2 Overview](https://www.w3.org/WAI/standards-guidelines/wcag/) — WCAG 2.2's status
  and recommendation date
- [European Commission / AccessibleEU — EN 301 549 has been updated](https://accessible-eu-centre.ec.europa.eu/content-corner/news/european-accessibility-standard-en-301-549-has-been-updated-2026-09-07_en) —
  v4.1.1, its WCAG 2.2 adoption, and the statement that the legal reference remains v3.2.1 until the
  OJEU citation
- [Google Search Central — Understanding Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals) —
  the metrics, the p75 rule, and the field-data basis

**Secondary** — read for corroboration, not cited for any claim above: vendor explainers on EN 301 549
and Core Web Vitals thresholds, which agree with the primaries and add nothing.

**Not used.** Any source giving a date for the OJEU citation. None of the ones checked does, and a
confident date here would be the F-21 defect — an agency blog's number arriving in a spec.
