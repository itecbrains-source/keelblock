# ADR-010: Internationalisation — ship the route structure now, with one locale

**Status:** Accepted · **Date:** 2026-09-07 · **Deciders:** owner, architect · **Supersedes** a non-goal in `PRODUCT.md`

## Context

`PRODUCT.md` listed i18n as a non-goal, beside "no admin panel, no CMS". **That grouping was a
category error**, and it is the reason this ADR exists rather than a quiet edit.

An admin panel is **additive**: bolt it on in month nine and nothing existing changes. i18n is
**pervasive**. next-intl's own setup instructions say it plainly:

> *"You'll move all existing layouts and pages into the `[locale]` segment."*

Every route moves. Every internal `<Link>` becomes locale-aware. Every rendered string goes through a
lookup. **The retrofit cost scales with the number of screens** — and keel has one page today. This
is the cheapest this decision will ever be, and it gets more expensive every week we build.

Two of the three serious kits in the field (Supastarter, BoxyHQ) treat i18n as table stakes.

## Decision Drivers

- The expensive-to-reverse part is the **route structure**, not the strings; strings can be extracted
  mechanically, moving every route and link cannot.
- keel's thesis is doing the expensive things right up front. i18n is expensive *precisely because*
  it is normally retrofitted.
- The stated non-goal about bloat still stands: keel should not ship five locales nobody asked for.

## Options Considered

### Option A: keep it a non-goal
| Pros | Cons |
|------|------|
| Nothing to learn, no `t()` in any component | The retrofit lands on whoever has 40 screens, and is invasive rather than additive — the exact "should have done it at the start" item |

### Option B: ship a `[locale]` segment with no library
| Pros | Cons |
|------|------|
| Structural benefit, near-zero cost | A segment that does nothing is a speculative abstraction, and an unexercised seam rots — the argument ADR-002 used to reject an auth seam |

### Option C: ship next-intl with one locale
| Pros | Cons |
|------|------|
| It actually works, so the seam is exercised on every page load | Every user-facing string goes through `t()` — a real, permanent ergonomic cost |
| Adding a language becomes one message file and one array entry | One dependency |

## Decision

**Chosen: Option C**, with `locales: ['en']` and `localePrefix: 'as-needed'`, so URLs stay clean
(`/settings`, not `/en/settings`) while the segment exists in the tree.

**Ship it now, at one page.** The argument is entirely about timing: the cost of this decision is
proportional to the surface it has to be applied to, and the surface is currently a single page.
Deferring it means paying the same cost later, multiplied.

**Locale comes from `next/root-params`, not request headers, and not `setRequestLocale`** (which
next-intl has deprecated). This is not a detail — it is what makes i18n compatible with Cache
Components at all. The URL segment is statically known at prerender time; a header is runtime data
and blocks prerendering, exactly as ADR-004 records for cookies. Measured: with `root-params` the
build produces `/en` as fully static and `/[locale]` as partially prerendered. With header-based
resolution it fails to build.

A **locale gate** (`npm run check`) enforces three things, because every one of them fails silently
at runtime: every locale carries exactly the default's keys · every `t('key')` in the source resolves
to a key that exists · every defined key is used. The second is the one that pays for the file — it
turns `t('titel')` from something a user in another language discovers into a build failure.

## Consequences

**Positive:** the invasive part is done at its cheapest. Adding a language is a message file plus an
array entry. Copy lives in one place, which makes it reviewable — a benefit that has nothing to do
with translation. Unused and misspelled keys are build failures.

**Negative:** every user-facing string goes through `t()` forever, which is a real ergonomic tax on
every component anyone writes. `Link` must be imported from `@/i18n/navigation`, and forgetting is a
silent bug until a second locale exists — currently caught by review rather than a gate, which is a
weaker mechanism than this project prefers and is noted here as such.
