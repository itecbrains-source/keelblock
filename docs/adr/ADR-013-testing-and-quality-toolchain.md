# ADR-013: Testing and quality toolchain

**Status:** Accepted · **Date:** 2026-09-08 · **Deciders:** architect

## Context

Tooling accretes. Every kit in the field has a `devDependencies` list nobody chose deliberately, and
each entry is a permanent maintenance obligation and a rot surface — in a project whose
differentiator is that it does not rot. So the toolchain is decided once, in full, with the refusals
recorded beside the adoptions.

The test is not _"is this tool good?"_ — most are. It is: **what failure does it catch that nothing
else here catches, and is that worth a permanent dependency?**

## Ships now

| Tool                              | The failure it catches                                                  | Why now                                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Vitest**                        | incorrect pure logic                                                    | already the unit layer                                                                                                            |
| **pgTAP** (`supabase test db`)    | a policy that does not do what we meant                                 | the intent layer; the only thing testing what is _inside_ a helper                                                                |
| **rlsautotest**                   | a policy that does not enforce what it declares                         | exhaustive where hand-writing cannot be                                                                                           |
| **knip**                          | dead code and unused dependencies                                       | found three orphans and an undeclared system binary on its first run                                                              |
| **ESLint** + `eslint-config-next` | framework-specific correctness, not just style                          | Next's own rules catch real bugs                                                                                                  |
| **Prettier**                      | **formatting arguments in review**                                      | keel had _none_. A starter whose contributions arrive in five styles taxes every reader forever, and the fix costs one dependency |
| **Renovate**                      | dependencies drifting unnoticed                                         | **ADR-007 names it and no config existed** — the same unbacked-claim defect as B-3, in our own decision record                    |
| **CodeQL**                        | injection and data-flow classes no gate here looks for                  | free on public repositories, GitHub-native,zero maintenance                                                                       |
| **`npm audit`** in CI             | known vulnerabilities in the tree                                       | built in, no dependency, fails on high severity                                                                                   |
| **cycle detection**               | an import cycle, which breaks tree-shaking and makes reasoning circular | the boundaries gate already walks the import graph; this is ten lines, not a dependency                                           |

## Ships with the spec that needs it

Not "later" — **bound to a spec**, so it cannot drift into never:

| Tool                         | Bound to                  | Why not now                                                                                                                                |
| ---------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Playwright** journey suite | SPEC-004 (auth) · DEF-002 | Browser tests against a login page that does not exist pin nothing                                                                         |
| **`@axe-core/playwright`**   | SPEC-015 · bar B-7        | Needs surfaces to audit. The accessible-locator rule (SPEC-002 REQ-3b) is already recorded so the suite is a11y-shaped from its first test |
| **`size-limit`**             | SPEC-028 · bar B-8        | Bundle budgets need a bundle worth measuring. Chosen over Lighthouse for the _build_ gate because it is deterministic and offline          |
| **Lighthouse CI**            | SPEC-028 · bar B-8        | Core Web Vitals against a deployed preview. Complements `size-limit`; neither replaces the other                                           |
| **MSW**                      | SPEC-007 (billing)        | Nothing external to mock until Stripe exists                                                                                               |

## Deferred, with the trigger that makes it real

**Mutation testing (Stryker)** — `DEF-011`. Every _gate_ here already carries a hand-written mutation
proof, which is the same idea applied where it matters most. Stryker generalises it to application
logic — and there is no application logic yet. Running it over gate scripts would be slow, noisy, and
tell us what we already know. It becomes valuable the moment money math exists.

**Property-based testing (fast-check)** — `DEF-012`. Excellent where a function has an invariant to
state: _splitting a payment conserves every cent_, _a permission check is never more permissive than
its policy_. keel has no such function yet. Adding it now would produce property tests over string
formatting, which is theatre.

## Refused, with reasons

- **Biome.** Faster than ESLint + Prettier and would replace both. Refused because `eslint-config-next`
  carries Next-specific correctness rules — not style, _bugs_ — and running two linters to keep them
  is worse than one slower one.
- **`dependency-cruiser` / `madge`.** They do what the boundaries gate already does, and it does it
  with the specific message keel needs (`page → helper → admin`, naming the chain). A dependency to
  replace ten working lines is the wrong direction.
- **Testcontainers.** The Supabase CLI already gives a real Postgres with the real auth schema. A
  second way to get a database is a second thing to keep working.
- **Jest.** Vitest, and having both is how a suite ends up half-migrated forever.
- **A second E2E framework.** One. Ever.

## Consequences

**Positive:** every tool present can name the failure it catches, and the deferred ones are bound to
triggers rather than to intentions. The refusals are written down, so the argument happens once.

**Negative:** four tools are bound to unbuilt specs, so the toolchain is genuinely incomplete until
those ship — and this ADR is where someone could quietly forget them. That is why each is a spec
reference or a `DEF-*` with a trigger, and not a sentence in a paragraph.
