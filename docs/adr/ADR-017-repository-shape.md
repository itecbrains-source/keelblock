# ADR-017: One application, not a workspace

**Status:** Accepted · **Date:** 2026-09-08 · **Deciders:** owner

## Context

keelblock is a single Next.js application at the repository root. MakerKit, Supastarter and Supajump all
ship Turborepo workspaces with `apps/` and `packages/`. Until now this repository had one passing
mention of the word "monorepo" and no decision behind it, which is the state this ADR exists to end:
undecided is worse than refused, because nothing surfaces it and the migration gets dearer.

Two things make it load-bearing rather than cosmetic:

- **B-6, removability.** Deleting an optional module is easier to demonstrate when the module is a
  package.
- **ADR-009's open-core boundary.** The paid layer reads keelblock's outputs and never patches its
  internals, and "extract the proof harness as an installable package" is a live strategy question.
  Both sound like workspace questions.

## Decision Drivers

- `PRODUCT.md`: _"It is **your** code from the first commit."_ A buyer inherits this layout.
- Every added mechanism is a rot surface, and this project's whole claim is about rot.
- The two arguments above must be answered rather than waved at.

## Considered Options

**A · Single application at the root.** What exists.

**B · Turborepo workspace** — `apps/web`, `packages/proof`, `packages/ui`, a task graph, a
workspace-aware lockfile, and a build orchestrator.

## Decision

**Chosen: Option A**, and the two counter-arguments are answered rather than dismissed.

**On removability.** Package boundaries make deletion _visible_, not _proven_. SPEC-014's test deletes
the module's files and asserts the gates stay green — and that assertion is exactly as strong against
a directory as against a package, because what it measures is whether anything else still references
it. `knip` already fails on an unused export or dependency, which is the same question asked
continuously. A workspace would give a tidier boundary and no more evidence, and evidence is the
currency here.

**On the open-core boundary.** ADR-009 draws its line at **outputs**: the paid layer consumes the
access matrix, the pgTAP results and the run history, and never reaches inside. That is a boundary
between two _repositories_, and a workspace does not help with it — the paid layer is not in this
tree and must not be. If the proof harness is ever published for other projects to install, that is a
package extracted **into its own repository** with its own release cycle, which is what Basejump did
with `supabase_test_helpers`: a separate repo, distributed through database.dev, not a folder inside
the starter.

**What Option B actually costs a buyer.** A task graph to learn, a second lockfile shape, a remote
cache to configure or ignore, and every import path prefixed with a package name — in a repository
whose selling point is that you can read all of it in an afternoon. It is a structure that pays for
itself at the second deployable application, and keelblock has one.

## Consequences

**Positive:** one `package.json`, one lockfile, one `tsc`, one build. A reader clones it and there is
nothing between them and the code. The gates run over a single tree, which is why `producedGates`
could be derived by following what `check.mjs` spawns.

**Negative — named:** a second deployable application (a docs site, a marketing app on a different
framework, an admin console) is the moment this becomes wrong, and converting later means moving every
file and rewriting every import at once. That is a real bill, deferred deliberately. **Reopen this ADR
when a second deployable exists** — not when the repository merely feels large, because size is not
the trigger; a second build is.

Note also that ADR-012 already refuses a second framework for the marketing pages, which removes the
most likely reason a second app would appear at all.
