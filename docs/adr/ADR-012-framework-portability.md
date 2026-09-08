# ADR-012: Framework portability — one framework, an honest seam

**Status:** Accepted · **Date:** 2026-09-07 · **Deciders:** owner, architect

## Context

keelblock is Next.js only, and that decision is load-bearing: the field maintains the same feature set
across three frameworks, so a single target is what makes feature-completeness affordable rather
than a slogan.

The reasonable follow-up is whether that forecloses a Nuxt, SvelteKit or TanStack Start port later —
and whether a second framework should be added _now_ for marketing pages (Astro was the specific
suggestion).

## Decisions

### 1 · One framework, and no second one for marketing

Astro's advantage on content pages is zero client JavaScript. Next 16 already prerenders keelblock's
landing fully static, so that ceiling is not what limits us. A second framework adds a second build
system, a second dependency tree and **a second surface that goes stale** — in a project whose
central differentiator is that it does not. It also doubles what every buyer maintains, permanently.

The concern underneath is legitimate: marketing pages must not read as generated filler. That is a
content problem and no framework solves it. keelblock's answer is `FINDINGS.md` — measured claims with
reproductions, which no competitor can publish because none of them did the measuring.

### 2 · The port seam already exists, and it is where the work is

A port is affordable or not depending on what has to be rewritten. In keelblock, the expensive half is
**already framework-agnostic**:

| Portable as-is                                        | Rewritten per framework                      |
| ----------------------------------------------------- | -------------------------------------------- |
| `supabase/` — schema, policies, pgTAP suites          | `src/app/` — routes, layouts                 |
| `scripts/` — every gate, the access matrix            | `src/components/`                            |
| `spec/`, `docs/adr/` — every decision and requirement | the framework adapter in `src/lib/supabase/` |
| `messages/` — translations                            |                                              |

The database is the product; the framework is a delivery mechanism for it. A Nuxt port inherits
tenant isolation, the proof harness, the gates and the access matrix unchanged, and rewrites the
view layer.

### 3 · Two rules that keep it that way, checked rather than remembered

- **No gate may depend on Next.** Every script in `scripts/` reads files, the database or the
  package manifest — none imports a framework. A gate that needed Next would silently make the
  suite unportable.
- **Framework APIs stay behind `src/lib/`.** Components and routes import from there, not from
  `next/*` directly, wherever a neutral alternative exists. The i18n `Link` rule (ADR-010) is
  already an instance of this, and it is already gated.

## Consequences

**Positive:** a port becomes a view-layer rewrite rather than a rebuild, and the guarantee that
matters — isolation, proven — comes with it unchanged. The rules cost nothing today because they
describe what the code already does.

**Negative:** this is a _provision_, not a plan. No second framework is promised, and if one is never
built, the two rules were still worth having — they are the same discipline that keeps the gates
runnable and the framework coupling shallow.
