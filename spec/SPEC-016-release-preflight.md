# SPEC-016: Release preflight

> Status: `draft` (corrected 2026-09-07 by [`research/06-RELEASE-SAFETY.md`](../research/06-RELEASE-SAFETY.md)) · Bars: **B-9**, **B-10** · ADRs: [003](../docs/adr/ADR-003-data-access.md), [008](../docs/adr/ADR-008-upgradability.md)
> Contracts: SPEC-003 ·

## Intent

Answer the one question neither existing command answers: **is this safe to release?**

`npm run check` asks _is this code correct_, and a wrong answer costs a red build. `npm run verify`
asks _will CI pass_, and a wrong answer costs a round trip. Preflight asks _is it safe to put this
in front of paying customers_, and a wrong answer costs an outage or a tenant leak in production.
The gap between the second and third question is where the expensive failures live.

It is aimed squarely at the team that bought keelblock and is deploying a commercial product: they have a
private repo, real customers, and a production database that no test suite has ever seen.

## Scope / non-scope

- **In scope:** migration safety under the old-code-still-running window · schema drift between a
  target environment and the repository, in both directions · access-matrix parity against the
  target · required secrets present by name · an honest verdict naming what was _not_ checked.
- **Out of scope, deliberately:**
  - **Anything `verify` already does.** Preflight is not a second CI mimic. If it ever grows a
    "does the build pass" step it has become `verify` with a different name, and this spec is the
    place that refusal is recorded.
  - **Correctness.** That is `check`, and preflight assumes it passed.
  - **Deploying.** Preflight never triggers a release; it reports.
  - **Prescribing a topology.** keelblock has no environments of its own yet and will not invent a
    deployment story for its users. Every check takes a named target.

## Sources of truth

- `docs/adr/ADR-008-upgradability.md`
- `docs/adr/ADR-003-data-access.md`
- `scripts/access-matrix.mjs`
- `scripts/check.mjs`
- `supabase/migrations/`

## Requirements

### REQ-1 — migrations are classified into three hazard classes, not two

Code and schema deploy by different mechanisms that fire on the same push, so for a window every
release runs **new code against the old database**. Research corrected the classification: it is not
safe-versus-destructive, it is three classes, and the middle one is the one that takes production
down without dropping anything.

| Class           | Examples                                                                | Preflight                                                  |
| --------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Additive**    | new column, new table, new index `CONCURRENTLY`                         | passes                                                     |
| **Lock-taking** | `CREATE INDEX` without `CONCURRENTLY`, `ALTER TABLE` forms that rewrite | warns with the expected lock, fails above a size threshold |
| **Destructive** | `DROP`, rename, tightened constraint, changed signature                 | fails — see REQ-1b                                         |

### REQ-1b — a destructive change requires evidence the _migrate_ phase completed

The established pattern is **three** phases — expand · migrate · contract — and the spec previously
described two. The middle phase is where the work is: backfill, dual-write, and confirm consistency
**under real traffic**. Splitting a destructive change across two deploys without it still breaks.

Preflight therefore demands evidence rather than a marker: the new structure exists, is populated,
and every running instance reports the migration head that contains it. keelblock can answer this because
`/api/health/deep` already reports the applied head — _"wait a full rollout cycle"_ is the part the
literature leaves vague and this makes checkable.

### REQ-1c — a verified, restorable backup exists

Standard deployment checklists put automated backups **and restore drills** ahead of everything else,
and SPEC-016 omitted them entirely — the most serious gap the research found. Preflight fails without
a recent backup, and **"restorable" means a drill has run**: a backup nobody has restored is a
belief, not a backup.

### REQ-2 — drift is a schema fingerprint, not a migration list

Comparing applied migrations catches a missing one. It **cannot** catch the case that matters most:
the same migrations applied, and the resulting schema then altered by hand in a console — which is
how production policies actually drift.

So drift is a **fingerprint of the realized schema** compared against an approved value, halting on
any difference until a human reviews it. Migration-set comparison remains as a second signal, because
a hole in the middle is drift even when the heads match. Repository-ahead is expected before a
deploy; target-ahead is always a finding.

### REQ-3 — the access matrix is verified against the target, not the local stack

keelblock's central claim concerns production, and policies can drift there without any commit — a
console edit, a hotfix, a half-applied migration. Preflight regenerates the matrix against the target
and diffs it against the committed copy. **A new permission in production that is not in the
repository is the exact failure keelblock exists to prevent**, and no local run can see it.

### REQ-4 — required secrets are present, by name

Each required secret is confirmed to exist in the target environment. **Names only — never a value,
never a prefix, never a length.** A preflight that leaks the shape of a secret into a log is a worse
problem than the one it was checking for.

### REQ-5 — preflight is read-only by construction

It opens read-only connections and runs no statement that can mutate. Not by convention or review,
but structurally, so that pointing it at production is always safe. A tool that is _usually_
read-only will one day be run against production by someone who assumed it was.

### REQ-6 — an unreachable environment is UNKNOWN, never OK

An environment that cannot be read, or is not configured, is reported as unverified and blocks the
verdict. It is never counted as passing. This is the single most tempting shortcut in a release tool
and the one that turns it into decoration.

### REQ-7 — the target is explicit, and never defaults to production

The environment is named on every invocation. There is no default, no "prod if unset", and no
inference from a branch name.

### REQ-8 — the verdict states what was not checked

Like `verify`, output distinguishes verified from assumed from unverified, and prints the proportion
genuinely checked. A release tool that prints only a tick teaches people to trust it exactly as far
as it should not be trusted.

### REQ-9 — it runs in the deploy path, not only on a laptop

The same command runs in whatever workflow performs the release, so the check cannot be skipped by
someone in a hurry — the person most likely to be releasing.

### REQ-10 — every check carries a mutation proof

A planted destructive migration, a planted drift, a planted matrix difference and a planted missing
secret each make preflight go red. A release gate that has only ever printed a tick has not been
shown to be looking at anything.

## Acceptance criteria

| AC    | Verifies | Method | Evidence                                                                                                                                                                                                                             | Status  |
| ----- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| AC-1  | REQ-1    | test   | `scripts/preflight/migration-safety.test.mts` — `drop column`, rename, tightened constraint and changed signature each fail; additive changes pass                                                                                   | planned |
| AC-2  | REQ-1    | test   | an explicitly marked schema-first migration passes, and the marker cannot be applied to a whole release                                                                                                                              | planned |
| AC-3  | REQ-2    | test   | `drift.test.mts` — target-behind, target-ahead, and **a hole with matching heads** are each reported                                                                                                                                 | planned |
| AC-4  | REQ-3    | test   | `matrix-parity.test.mts` — an extra permission in the target fails, quoting the row                                                                                                                                                  | planned |
| AC-5  | REQ-4    | test   | `secrets.test.mts` — a missing secret fails; a present one is confirmed **without its value appearing in output**                                                                                                                    | planned |
| AC-6  | REQ-5    | test   | `readonly.test.mts` — every statement preflight issues is rejected by a read-only connection                                                                                                                                         | planned |
| AC-7  | REQ-6    | test   | an unreachable target yields `unverified`, never `ok`                                                                                                                                                                                | planned |
| AC-8  | REQ-7    | test   | invoking without a target exits non-zero and names no environment                                                                                                                                                                    | planned |
| AC-9  | REQ-8    | test   | the verdict reports counts and the unverified list                                                                                                                                                                                   | planned |
| AC-10 | REQ-9    | test   | the deploy workflow invokes preflight, asserted against the **parsed** workflow                                                                                                                                                      | planned |
| AC-11 | REQ-10   | test   | four mutation proofs, each restoring a real defect and asserting red                                                                                                                                                                 | planned |
| AC-12 | REQ-1b   | test   | a destructive change is refused while the new structure is unpopulated or any instance reports a head without it, and passes only on all three — the marker alone does not satisfy it, which is the difference between this and AC-2 | planned |
| AC-13 | REQ-1c   | test   | preflight fails with no recent backup, and fails again with a recent backup that has never been restored — "restorable" is the drill, not the file                                                                                   | planned |

## Definition of Done

- [ ] Every REQ `done` with its AC passing, or a valid `DEF-*`.
- [ ] Every check has a mutation proof, verified by restoring the defect and watching it fail.
- [ ] Run against a real non-local environment at least once, and the output recorded. **Until that
      happens this is an untested release gate**, which is precisely the thing it exists to prevent.
- [ ] Documented in the README beside `check` and `verify`, as three questions rather than three names.

## Deferrals

- **`DEF-001` — a deploy topology for keelblock itself.** Registered in
  [`spec/DEFERRAL_REGISTRY.md`](DEFERRAL_REGISTRY.md) with the trigger
  `file-exists:.github/workflows/deploy.yml`, so the moment keelblock gains a real deployment the build
  fails until that ADR is written. It is not a note in this section — a note in a section is what
  rots.

## Out-of-spec log

Recorded because it reverses an earlier position in this project: preflight was first rejected as
duplicating `verify`. That was correct for a preflight that re-ran CI, and wrong for this one. The
distinction that makes it worth building is the **question asked**, not the commands run — and REQ's
non-scope exists to stop it drifting back into the version that was rightly rejected.
