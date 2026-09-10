# SPEC-012: Docs & the stranger walkthrough

> Status: `partial` · Bars: **B-5** · Research: [`research/14-EXECUTABLE-DOCS.md`](../research/14-EXECUTABLE-DOCS.md) · ADRs: [019](../docs/adr/ADR-019-documentation-timing.md)
> Contracts: SPEC-011, SPEC-024, SPEC-032 ·

## Intent

Bar B-5's stated proof is "a scripted walkthrough run by someone with no prior context, timed and
recorded" — **a promise about a future event**, which is the shape B-1 was in until it became a job
with a budget. This spec keeps the half of that promise a machine can keep, and says plainly which
half it is not keeping.

The setup page could not be written until now. Its shape depends on the scaffolder, so writing it
against `git clone <this repo>` would have meant rewriting it a week later. `create-keelblock-app`
exists, so the page can finally be true.

Every kit's install documentation rots because nothing runs it, and it rots where the reader has
least context to recover from it. Measured on the closest comparable kit: `boxyhq/saas-starter-kit`
has one CI workflow and every step in it runs an npm script — no step executes their installation
documentation.

## Scope / non-scope

- **In scope:** `docs/GETTING-STARTED.md` · a runner that extracts and executes its shell blocks ·
  a CI job that follows the page in an empty directory and asserts an artefact, not an exit code.
- **Not in scope, and deliberately not absorbed:** whether the page **teaches**. A machine will
  happily execute an incomprehensible sequence. That is B-11, measured by the handover trial
  (SPEC-024), and its human leg is **DEF-024**. A green walkthrough is evidence the instructions
  WORK and no evidence at all that they TEACH — said in the page itself, not only here.
- **Not in scope:** the task guides. They do not depend on the scaffolder, one already exists
  (F-47), and their failure mode is different — a wrong recipe is caught by the gates it teaches you
  to run.

## Sources of truth

- `research/14-EXECUTABLE-DOCS.md` — rustdoc's documentation tests, Go's testable examples, the
  measured competitor workflow, and the boundary this spec refuses to cross.
- `.github/workflows/check.yml` job `scaffold` — the template for the runner and its timing.

## Requirements

### REQ-1 — the page is the source, and it runs

`scripts/walkthrough.mjs` reads `docs/GETTING-STARTED.md`, takes its shell blocks in order, and
executes them **in one shell** — a person follows the page in one terminal, and `cd my-app` is
load-bearing for every block after it. A runner that used one shell per block would execute the rest
in the wrong directory and still pass.

### REQ-2 — the default is to run, so forgetting is loud

A block opts out with `ignore` **and a reason**, adopting rustdoc's in-band attributes rather than
inventing a scheme. An unknown marker is an error. A reason too short to be a reason is an error.

### REQ-3 — substitutions are declared, reasoned, and shrink-only

One exists: `npx create-keelblock-app` resolves to a placeholder package until **DEF-027** closes, so
CI scaffolds from the checkout instead. It is visible in the runner, carries its reason, is counted,
and a substitution that no longer matches the page is a failure — a rule that has silently stopped
applying is a stale allowance by another name.

### REQ-4 — something must be PRESENT

The page's commands could exit zero having produced nothing. The job asserts the project exists,
declares itself generated, and that the page's env step happened. Go's examples make the same point
by comparing output; output is the wrong currency for a shell, so this asserts the artefact.

### REQ-5 — a walkthrough of nothing is not green

A page with no runnable block, or one whose every block is skipped, fails. F-41 and F-48 are that
defect twice.

### REQ-6 — timed, and run from an empty directory

The runner reports its own duration, and the job starts in `/tmp/stranger` with nothing from the
checkout on the path but the two variables the one declared substitution needs.

## Acceptance criteria

| id   | requirement      | kind          | evidence                                                                                                                                                                              | status       |
| ---- | ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| AC-1 | REQ-1            | ci            | `.github/workflows/check.yml` job `walkthrough` — follows the page in an empty directory; measured locally at 69s, five blocks, and the whole loop green inside the generated project | **done**     |
| AC-2 | REQ-2            | test          | `scripts/walkthrough.test.mts` — default is run; `MUTATION` an unreasoned skip is refused; an unknown marker is an error                                                              | **done**     |
| AC-3 | REQ-3            | test          | `scripts/walkthrough.test.mts` — every substitution carries a reason, the list is length-pinned, and each must still match the page                                                   | **done**     |
| AC-4 | REQ-4            | ci            | `.github/workflows/check.yml` job `walkthrough`, step "the page produced a real project, not a green log"                                                                             | **done**     |
| AC-5 | REQ-5            | test          | `scripts/walkthrough.test.mts` — the real page runs more than three blocks, and every skip explains itself                                                                            | **done**     |
| AC-6 | REQ-6            | ci            | `.github/workflows/check.yml` job `walkthrough` — the runner prints its own duration, and the job creates an empty directory outside the checkout to run it in                        | **done**     |
| AC-7 | non-scope        | test          | `scripts/walkthrough.test.mts` — the page must say a green run is not evidence it teaches; if that sentence goes, B-11 has been absorbed into a badge                                 | **done**     |
| AC-8 | B-5's other half | demonstration | the timed walkthrough by a person with no prior context — **DEF-024**, and not claimable by this spec                                                                                 | **deferred** |

## Definition of Done

- [x] The page exists, is executed on every push, and produced a real project when it ran.
- [x] The boundary is written where a reader meets it, not only in the spec.
- [ ] B-5 is fully claimed. It is not, and this spec does not claim it: the human half is DEF-024.
      **B-5 stays unclaimed** — a bar half-proven by a machine is not a bar met.

## Deferrals

- **DEF-024** — the human half of the walkthrough, already open for B-11 and shared with this bar.
- **DEF-027** — publishing the scaffolder, which retires this spec's only substitution.
