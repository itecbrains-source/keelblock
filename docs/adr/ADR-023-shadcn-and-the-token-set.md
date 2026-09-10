# ADR-023: shadcn/ui with Base UI — and the three places keelblock deliberately diverges

**Status:** Accepted · **Date:** 2026-09-10 · **Deciders:** owner

## Context

**This ADR reverses nothing.** `docs/PRODUCT.md` has said since 2026-09-07:

> **Not a component library.** shadcn/ui is used; keelblock does not invent a design system to fight.

It was not installed. `src/components/` did not exist, there was no `components.json`, no Radix and no
Lucide in the manifest, `globals.css` carried two custom properties, and fourteen `.tsx` files used
inline Tailwind throughout. **The governing document asserted a fact that was false for three days.**
So the decision here is a correction with two possible endings — the sentence becomes true, or the
sentence goes — and the owner chose the first.

There is no non-goal to reverse, because shadcn's own first line is _"This is not a component
library. It is how you build your component library."_ Components are copied into the repository and
the source is owned. That satisfies "keelblock does not invent a design system" and it satisfies "it
is your code from the first commit".

## Decision Drivers

- **B-7 is the real reason.** The acceptance bar reads _"Accessible: keyboard-complete, axe-clean on
  every shipped surface"_, proven per surface by an automated axe pass plus a manual keyboard
  walkthrough. Hand-rolled primitives mean focus management, ARIA and keyboard behaviour written and
  **proven** per component, forever, by a project that has already decided it will not build a
  component library. shadcn/Base UI ship that behaviour already proven upstream. **shadcn is how B-7
  becomes affordable, not how keelblock gets prettier.**
- **The cost is proportional to the surface it must be applied to.** ADR-010 made this argument about
  i18n — _"pervasive rather than additive … and that surface was a single page at the time."_ Design
  is pervasive the same way. Fourteen `.tsx` files across five routes is the cheapest this will ever
  be; every one of the sixteen unbuilt areas is another UI surface.
- **Parity, and only parity.** MakerKit uses shadcn. Supabase's own official UI library is built on
  shadcn. shadcn is the default. Adopting it buys keelblock nothing distinctive — there is no version
  of "be better at shadcn" that produces an advantage. It is table stakes, and the budget it frees is
  the point.

## Decision

**shadcn/ui, on Base UI, with the token set as the first deliverable.**

Base UI rather than Radix: as of the July 2026 changelog new projects use Base UI by default, and
`shadcn init -b radix` is the opt-out. Radix is explicitly not deprecated, so this is a choice rather
than a forced migration — and it is a choice with a per-component migration cost if made later, which
is the argument for making it now, while three components exist.

**MakerKit's discipline, not their monorepo.** Their rule, adopted verbatim in spirit: adjust through
`className` so the vendored primitive stays upstream-equivalent and CLI-replaceable. `components/ui/*`
is **not edited**. Tones and variants are reached by token mapping and by props, never by forking.

## The three divergences, which are the part worth reading

Everything above is what any project adopting shadcn would write. These are keelblock's.

### 1 · The dark variant is keyed on the operating system, not on a class

`shadcn init` writes `@custom-variant dark (&:is(.dark *))` — a **class**, set by a theme toggle it
assumes the project has. **ADR-018 refused that toggle**, with reasons: a `localStorage` toggle needs
a blocking pre-paint script, and a server-persisted one is a per-request read that stops the shell
prerendering under Cache Components (ADR-004).

Nothing in this repository sets `.dark`. Taking the default made all 36 `dark:` variants across 13
files dead on arrival and dark mode stopped working — **silently, in every layer**: a variant that
never matches is not an error, so the CSS compiled, the build passed, typecheck passed, every test
passed, and the page rendered in the light palette on a machine set to dark. That is **F-67**.

The stylesheet declares `@custom-variant dark (@media (prefers-color-scheme: dark))` and hangs the
dark palette off `@media (prefers-color-scheme: dark) { :root { … } }` instead of `.dark { … }`. The
tokens inside are upstream's and are not edited — **only the selector they hang from**, which is the
correct layer to diverge in: the theme is ours, the components stay replaceable.

`src/theme.test.mts` is the mechanism ADR-018 never had. The CLI will overwrite that line again on the
next `init` or theme-touching `add`; that is not a reason to avoid the CLI, it is the reason the test
exists.

### 2 · `components/ui/**` is exempt from `knip`, and the code is not

knip correctly reports `buttonVariants` as an unused export. It is — upstream exports it for
consumers this project does not have yet. **Editing a vendored file to satisfy a linter is precisely
the fork the discipline forbids**, so the directory is exempted and the code is left alone. The
exemption is justified in `knip.reasons.md` like every other, and expires when keelblock stops using
shadcn.

### 3 · The dependency floor is held, and unused deps were removed rather than tolerated

`shadcn init` installed `lucide-react` and `tw-animate-css`. Neither was used by anything: no icon,
no `animate-*` class. PRODUCT.md's complaint about competitors is bloat — _"Supastarter ships five
payment providers, an AI chatbot and i18n"_ — so carrying two unused packages on day one to look
complete would be the same failure in miniature. Both were removed, along with the `@import` line.
`shadcn add` re-adds whichever a future component genuinely needs, which is the right time to acquire
them.

`src/lib/utils.ts` — created by the CLI as `export { cn } from 'cn'` — was deleted: shadcn 4.x
components import `cn` directly, so the file was dead the moment it was written.

`shadcn` itself **stays a runtime dependency**, and this was measured rather than assumed. It looked
like a CLI left in the manifest; removing it broke the build, because `globals.css` does
`@import 'shadcn/tailwind.css'` and knip does not follow `.css` imports. It is exempted for the same
reason `tailwindcss` is, and the reason is recorded as a false positive rather than as a tidy-up.

## Consequences

- The sentence in PRODUCT.md is true. It is verified by `src/theme.test.mts` and by the login surface
  actually rendering `Button`, `Input` and `Label`.
- The login form got **shorter**, and its `dark:` variants are gone rather than doubled — tokens are
  already correct in both schemes, so `text-muted-foreground` replaces
  `text-black/60 dark:text-white/60`. That is the shape the rest of the migration takes.
- **Still owed, and named so it is not mistaken for done:** the remaining surfaces are not migrated,
  and the consistency gate the owner asked for — _no hard-coded colour or spacing value outside the
  token set_ — is not written. It belongs with that migration rather than before it: run against
  today's tree it would fail on every unmigrated file, and a gate that cannot pass on the day it
  lands is a gate that gets exempted.
- Accessible locators paid for themselves. The journeys select by `getByLabel('Email address')` and
  `getByRole('button', …)` (SPEC-002 REQ-3b), so swapping hand-rolled markup for Base UI primitives
  changed no test.
