# SPEC-011: `create-keelblock-app`

> Status: `done` · Bars: **B-1** · Research: [`research/13-SCAFFOLDING.md`](../research/13-SCAFFOLDING.md) · ADRs: [008](../docs/adr/ADR-008-upgradability.md), [017](../docs/adr/ADR-017-repository-shape.md)
> Contracts: SPEC-013, SPEC-012 ·

## Intent

Bar B-1 claims a running application in five minutes. Before this spec that claim was not unmet — it
was **unfalsifiable**, because the thing it describes did not exist. It is the only bar in the set
that could not be tested at all, and it gates evaluation: nobody assesses a starter they cannot
start, and the npm names are already published as placeholders that say "not yet functional".

The scaffolder is not a file-copying problem. `research/13-SCAFFOLDING.md` measured the reason:
**scaffolding and upgrading are one decision seen twice.** What the generated project remembers about
its origin is exactly what `scripts/upgrade.mjs` reads, and a plain tarball copy — the ordinary shape
of a `create-*-app` output — dies on that script's first command with `fatal: bad object`. B-10's CI
job is green because its scaffold is a `git worktree` carrying every ref, which no buyer will have.
So this spec's real subject is provenance, and B-1 is the part you can see.

## Scope / non-scope

- **In scope:** the CLI · what the generated project records about its origin · the exclusions that
  make a generated project's own gates pass · a CI job that scaffolds and **times** it.
- **Not in scope:** publishing to npm (a release act, SPEC-016 and the owner's) · a `keelblock
upgrade` CLI verb (`scripts/upgrade.mjs` already ships into the project) · removing optional
  modules at generation time (SPEC-014, and F-56 measured what that costs) · package-manager
  variants.

## Sources of truth

- `research/13-SCAFFOLDING.md` — the three-shape experiment and the settled provenance model.
- `scripts/upgrade.mjs` — `UPSTREAM_OWNED`, and the `upstream/main` default that already encoded the
  answer nobody had written down.
- `.github/workflows/check.yml` — the `upgrade` job, whose scaffold shape this spec explains.

## Requirements

### REQ-1 — one command produces a project that is not keelblock

Files, not history: a snapshot of one ref, `git init`, one commit. The manifest takes the buyer's
name, resets the version and is `private`, so keelblock's publish metadata cannot carry a buyer's
application to npm.

### REQ-2 — the generated project records its provenance, machine-readably

`keelblock.provenance.json`, naming the ref **and** the commit — a tag moves, and an upgrade cannot
be ambiguous about what it is upgrading from.

### REQ-3 — the project can reach the objects an upgrade needs, without paying for them now

An `upstream` remote is configured and **not fetched**. Objects must be reachable or `upgrade.mjs`
cannot start; fetching keelblock's history at generation time spends the five-minute budget on
something the buyer may never use. The scaffolder prints the two-command upgrade, because it is the
one thing nobody can guess.

### REQ-4 — a generated project's own gates pass, and the exclusions are measured rather than guessed

A scaffold was built and `npm run check` run inside it. Everything passed except the review
apparatus, and the exclusion list is exactly what that run named — `docs/review/` and the two tests
that assert against the real register. The readers ship.

### REQ-5 — the review rule is skipped only when the project SAYS it is generated

Before this spec the rule was `if (existsSync(AUDIT))`: delete the directory and the whole review
check stopped running, silently. It is now decided by something present — the provenance file — and
a **missing** audit in a project that does not declare itself generated is a failure.

### REQ-6 — five minutes is a measurement that can go red

A CI job scaffolds from the packed package, installs, and runs the full loop under a stated budget.
B-10 is the only bar currently proven rather than asserted, and this is the same move.

## Acceptance criteria

| id   | requirement | kind          | evidence                                                                                                                                                                                 | status   |
| ---- | ----------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| AC-1 | REQ-1       | test          | `scripts/create-keelblock-app.test.mts` — `rewriteManifest` takes the name, resets the version, sets `private`, drops `publishConfig`, keeps scripts                                     | **done** |
| AC-2 | REQ-2       | test          | `scripts/create-keelblock-app.test.mts` — `provenanceFor` records ref and commit; the marker field is asserted against the gate that reads it                                            | **done** |
| AC-3 | REQ-3       | test          | `scripts/create-keelblock-app.test.mts` — `nextSteps` carries `git fetch upstream --tags` and `scripts/upgrade.mjs`, plus the Python toolchain that is not an npm dependency             | **done** |
| AC-4 | REQ-4       | test          | `scripts/create-keelblock-app.test.mts`, `MUTATION` — `filesToCopy` holds back the records and their tests and ships the readers; every exclusion carries a reason; list may only shrink | **done** |
| AC-5 | REQ-5       | test          | `scripts/check-promises.test.mts` — a missing audit FAILS when undeclared and is exempt when the provenance file is present, both proven by mutation                                     | **done** |
| AC-6 | REQ-6       | ci            | `.github/workflows/check.yml` job `scaffold` — times scaffold → install → `npm run check` and fails over budget                                                                          | **done** |
| AC-7 | REQ-1..4    | demonstration | `research/13-SCAFFOLDING.md` — the three-shape upgrade experiment, and the scaffold-and-check run that produced the exclusion list                                                       | **done** |

## Definition of Done

- [x] A generated project passes its own `npm run check`.
- [x] The provenance model is the one the memo settled, and `upgrade.mjs` needs no change to consume it.
- [x] Five minutes is enforced by a job rather than asserted in a document.
- [ ] The package is published, so the job can scaffold from the registry rather than a packed
      tarball. That is a release act and it is the owner's — **DEF-027**.

## Deferrals

- **DEF-027** — scaffolding from the published registry package rather than a locally packed tarball.
