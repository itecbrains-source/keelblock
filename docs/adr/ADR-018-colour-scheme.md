# ADR-018: The colour scheme follows the operating system; there is no toggle

**Status:** Accepted · **Date:** 2026-09-08 · **Deciders:** owner

## Context

A competitive pass listed dark mode as undecided and "trivial to build". The first half was right —
the words "dark mode" appeared nowhere in this repository — and the second half is wrong in both
directions, which is why this ADR measures before deciding.

**Measured 2026-09-08:** dark mode already works. `src/app/globals.css` defines `--background` and
`--foreground` and overrides both inside `@media (prefers-color-scheme: dark)`, and there are **36
`dark:` variants across 13 component files**. Open the app on a machine set to dark and it is dark.

So the undecided thing was never the palette. It is the **toggle** — a control that overrides the
operating system and remembers the choice — and that is not trivial.

## Decision Drivers

- Anything remembered per user is either a cookie or a column, and both are schema-or-session
  decisions rather than CSS.
- ADR-004: this app renders under Cache Components. A value that must be known before first paint and
  differs per user is exactly the kind of value that shape makes expensive.
- The wrong outcome is a control that flashes the wrong colour on every load, which is more noticeable
  than having no control at all.

## Considered Options

**A · Follow the OS. No toggle.** What ships today.

**B · A toggle persisted in `localStorage`**, applied by a script before paint.

**C · A toggle persisted server-side** — a cookie or a column on the profile — resolved during render.

## Decision

**Chosen: Option A.** The operating system already carries this preference, the user has already set
it, and every surface here honours it.

**Why B is refused rather than postponed.** Reading `localStorage` happens after hydration, so the
first paint is whatever the server rendered: the fix is a blocking inline script that reads storage
and sets a class before the document paints. That script is untyped, runs outside React, must be kept
in step with the class names in `globals.css`, and is the standard source of the flash-of-wrong-theme
that the toggle exists to avoid. It buys an override for a preference the user already expressed
correctly elsewhere.

**Why C is refused for now.** A cookie read during render makes every page dependent on it, which
under Cache Components (ADR-004) is precisely the thing that stops a shell prerendering — F-38 is the
measured record of how that shape behaves here. A per-user column is worse: it is a schema change and
a read on the hot path for a colour.

**What would change this.** A user whose OS preference is genuinely wrong for the app — a dark-desktop
user who needs a light document view for a print-shaped screen, or an accessibility requirement for a
specific contrast. That is a real reason and it has not appeared. **Reopen when SPEC-008 builds the
settings surface**, where a preference has a natural home and the cookie already has a reason to
exist, rather than being introduced for this alone.

## Consequences

**Positive:** dark mode ships, costs nothing, and cannot flash the wrong colour, because there is no
client-side correction to apply. Nothing is added to the schema, the session or the render path.

**Negative — named:** a user cannot override their OS inside the app, and some people do want that.
The palette is also only two variables deep, so component-level `dark:` variants are written by hand
and can be forgotten on a new surface — a real risk that no gate currently catches, and deliberately
not gated, since a design-token audit is SPEC-015's territory rather than a rule about colours.
