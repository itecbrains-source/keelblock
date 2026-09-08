# SPEC-013: Upgrade path

> Status: `done` · Bars: **B-10** · Research: [`research/10-UPGRADE-PATH.md`](../research/10-UPGRADE-PATH.md) · ADRs: [008](../docs/adr/ADR-008-upgradability.md), [003](../docs/adr/ADR-003-data-access.md)
> Contracts: SPEC-001, SPEC-002, SPEC-003 ·

## Intent

A project scaffolded from keelblock `N` can take keelblock `N+1`'s security fixes, by a path that is executed
on every push rather than written down. `PRODUCT.md` calls this the deepest structural failure in the
category; the two paid kits answer it with a git remote, and supastarter's own documentation admits
the answer degrades in proportion to how much of their product you used. After this, keelblock's answer is
a CI job somebody else can read.

What it is not is a claim that anyone has upgraded. The buyer in that job is **synthetic**: keelblock has
no users and no deployment (DEF-001). What is proven is that the path works, not that it has been
walked.

## Scope / non-scope

- **In scope:** the ownership boundary as code; applying upstream-owned changes to a diverged
  project; the CI job that scaffolds at the previous tag and runs today's suite against the result;
  saying out loud what the upgrade did not do.
- **Out of scope, and named so it is a decision:**
  - **Codemods.** ADR-008 promises them for breaking changes. No breaking product-API change has
    happened yet, so a codemod written now would be written against an imagined one — the exact
    unexercised-seam problem ADR-002 refuses. The design principle is already settled by
    `research/10`: a transform that cannot finish must break the build rather than half-apply, as
    Next's do. Deferred: **DEF-021**.
  - **GitHub Security Advisories.** A publishing act on a release process that does not exist.
    Deferred: **DEF-022**.
  - **`create-keelblock-app`.** SPEC-011. Until it exists, "scaffold" means a clone at a tag, which is
    what the CI job does.
  - **Product-code merges.** Never in scope, at any version. See REQ-2.

## Sources of truth

- `docs/PRODUCT.md` — B-10
- `docs/adr/ADR-008-upgradability.md` — the strategy, and its 2026-09-08 correction
- `research/10-UPGRADE-PATH.md` — how four other ecosystems answer this
- `docs/FINDINGS.md` — F-45, F-46
- `scripts/upgrade.mjs`, `.github/workflows/check.yml`

## Requirements

### REQ-1 — the ownership boundary is code, not prose

Which paths an upgrade may take is a list in `scripts/upgrade.mjs`, not a convention. Without it the
boundary lives in whoever is doing the upgrade, and the failure is silent and expensive: an unattended
upgrade overwrites work somebody was paid to do.

### REQ-2 — an upgrade never touches a file the buyer owns

Not "tries not to". `src/`, `messages/`, the buyer's tests and their configuration are outside the
taken set at every version. This is the requirement that makes the path runnable unattended, and it is
the one supastarter's documentation is describing when it says updating "will become harder" with
every change you make — that difficulty is what happens when an upgrade reaches into product code.

### REQ-3 — schema is cumulative and adopted whole

MEASURED (F-46). A buyer who takes only the security migration fails today's suite, because the suite
tests a feature they skipped — so ADR-008's "cosmetic changes need not reach" and B-10's "runs the
current suite green" cannot both hold under selective adoption. Schema is additive, arrives with its
own tests, and a half-adopted schema is a state nobody has tested; product code is the opposite. So
migrations are taken whole and product code is never taken at all.

### REQ-4 — migrations apply out of order, and the tool must be told so

MEASURED (F-45). `supabase migration up` refuses a migration whose version sorts before the buyer's
last applied one — the ordinary case, since the buyer kept working after cloning. ADR-008 assumed such
a file "never conflicts". `--include-all` is required, and the path passes it deliberately rather than
leaving a buyer to find the error and paste a flag they have not understood.

### REQ-5 — a generated artifact is regenerated, never delivered

MEASURED (F-45). After an upgrade, upstream's `database.types.ts` names tables the buyer does not have
and omits the ones they wrote; the buyer's names neither. Neither file is correct, so neither can be
shipped. The upgrade reports them for regeneration and does not touch them.

### REQ-6 — the upgrade says what it did NOT do

An upgrade that reports only its successes reads as a complete one. The path prints the files it left
alone and the artifacts needing regeneration, every run.

### REQ-7 — the path is executed in CI, against a diverged project

B-10's stated proof. The job scaffolds at the previous tag, gives that buyer their own migration dated
after the fix and their own product edit, applies the upgrade, runs **today's** suite, and asserts the
buyer's files are unchanged. Until it runs on the runner it is a script somebody ran once.

## Acceptance criteria

| AC   | Verifies | Method | Evidence                                                                                                                                                                                                                                                                       | Status   |
| ---- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| AC-1 | REQ-1    | test   | `scripts/upgrade.test.mts` — `planUpgrade` splits a release's changed paths into taken, left and regenerate; the lists are asserted non-empty and disjoint                                                                                                                     | **done** |
| AC-2 | REQ-2    | test   | `scripts/upgrade.test.mts` — six real buyer paths (`src/app/[locale]/orgs/page.tsx`, `messages/en.json`, `package.json` among them) are asserted NEVER taken, plus a path under a buyer-named directory to prove the prefix anchors at the start rather than matching anywhere | **done** |
| AC-3 | REQ-3    | test   | `.github/workflows/check.yml` `upgrade` job — the buyer adopts every new migration and today's full suite runs against the result; measured failing under selective adoption (F-46)                                                                                            | **done** |
| AC-4 | REQ-4    | test   | `.github/workflows/fixtures/buyer_customer_note.sql` is dated `20260910090000`, after the fix it will receive, precisely to force the refusal; the `upgrade` job applies with `--include-all` and `scripts/check-workflow.test.mts` asserts the fixture is used                | **done** |
| AC-5 | REQ-5    | test   | `scripts/upgrade.test.mts` — a generated artifact is neither taken nor left silently; it is reported for regeneration                                                                                                                                                          | **done** |
| AC-6 | REQ-6    | test   | `scripts/upgrade.test.mts` — the plan's `leave` and `regenerate` sets are returned rather than discarded, which is what the script prints                                                                                                                                      | **done** |
| AC-7 | REQ-7    | test   | `scripts/check-workflow.test.mts` — asserts against the PARSED workflow that the job scaffolds at the previous tag, resets the scaffold, and fails the build unless the buyer's files are unchanged; mutation-proven by removing the guard step                                | **done** |
| AC-8 | REQ-7    | test   | `docs/TESTING.md` — the first green run (34282685924, 2026-09-08) recorded from its LOG rather than its badge: the tag it scaffolded at, the buyer's own migration applied first, the two applied out of order, every file in today's suite, and no change under `src/`        | **done** |

## Definition of Done

- [x] Every REQ `done` with its AC passing, or a valid `DEF-*`.
- [x] The experiment run once and what broke written down — F-45, F-46 — rather than a mechanism
      shipped as though nothing had.
- [x] ADR-008's incorrect claim corrected in the ADR rather than quietly worked around.
- [x] **AC-8**: green on the runner, run 34282685924. The log was read rather than the badge: it
      names the tag it scaffolded at, the buyer's own migration, the two it applied out of order, and
      every test file in today's suite. A job that passes on its first run is exactly when to check
      it did the work.

## Out-of-spec log

- The taken set is deliberately **conservative**: `docs/`, `CHANGELOG.md` and `docs/review/` are left
  to the buyer even though they are arguably upstream's. Leaving a file that could have been taken
  costs a manual copy; taking one that should have been left destroys work. When the boundary is
  arguable, the path leaves it.
- `scripts/` is upstream-owned, which means an upgrade replaces the buyer's gates. That is
  deliberate — the gates are the product — but it is the one place REQ-2's reasoning is inverted, and
  it is stated here rather than discovered by someone who customised one.
