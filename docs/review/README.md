# External review — 2026-09-08

An adversarial review of keel, commissioned at commit `9c0721c`, written to the standard the
repository sets for itself: **nothing here is asserted that was not reproduced**, and every claim
names the command that produces it.

The brief was to assume the project fails and go looking for the reason. Read
[`00-VERDICT.md`](00-VERDICT.md) first; it is the only document that summarises.

| Document                                   | What it answers                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| [`00-VERDICT.md`](00-VERDICT.md)           | What keel is, what is genuinely right, and the things that would kill it       |
| [`01-AUDIT.md`](01-AUDIT.md)               | Every defect found in the claim and the gate suite, with a reproduction        |
| [`02-EXECUTION.md`](02-EXECUTION.md)       | How an expert team would staff and sequence this, and what to stop doing       |
| [`03-POSITIONING.md`](03-POSITIONING.md)   | Market, name, moat, commercial model — checked against sources read on the day |
| [`04-SCORECARD.md`](04-SCORECARD.md)       | A rubric with thresholds, today's score, and how to re-score without opinion   |
| [`05-VERIFICATION.md`](05-VERIFICATION.md) | An independent re-check of the dispositions, by planting each defect again     |
| [`DISPOSITIONS.md`](DISPOSITIONS.md)       | **The only live file here** — one row per finding, enforced by `npm run check` |
| [`DISPOSITIONS.md`](DISPOSITIONS.md)       | **What was done about each finding.** The only live file here                  |

## Status of this review

**Every document here except [`DISPOSITIONS.md`](DISPOSITIONS.md) is frozen.** They record what was
found on 2026-09-08 and are never edited — correcting a review's numbers falsifies the finding, which
is why `npm run status --check` excludes this directory. The answers live in `DISPOSITIONS.md`, and
whether the review is closed is **computed, not written down**:

```bash
npm run status     # REVIEW  14 findings · 12 implemented · 0 refuted · 2 deferred — CLOSED
```

`npm run check` fails if any finding lacks a disposition, if a disposition names a file that no
longer exists, or if a finding marked `deferred` points at a deferral that has since closed.

This is **an external document, not a governing one.** It does not amend `PRODUCT.md`, and no
acceptance bar depends on it. Where it disagrees with a decision record, the decision record still
stands until someone changes it deliberately — that is the repository's own rule and the review does
not get an exemption from it.

Every reproduction below was run on 2026-09-08 against a working tree identical to `9c0721c`. Where
a check could not be run — anything needing Docker, `psql` or the Supabase CLI — the review says so
and does not guess the result.

## What could not be verified

Stated up front, because a review that hides its own gaps is doing the thing it is criticizing.

- **The database-backed gates** — `schema`, `policy`, `generated` — were not executed. No local
  Supabase stack was available. Findings about them are from reading their source and their committed
  output, never from watching them run.
- **The unit layer** did not execute: `vitest` failed to start on the review machine (a native
  `rolldown` binding built for a different platform). That is an artifact of the review environment,
  **not a defect in keel**, and no finding rests on it.
- **The four SQL suites** were read, not run.

Eight gate scripts were executed end to end. Their verdicts are quoted where used.
