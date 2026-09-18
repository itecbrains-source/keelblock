# Where this session ends — 2026-09-18

```yaml
record: 15
commit: 4e424fd
date: 2026-09-18
```

**Tenth dated record**, covering the twenty-five commits since record `14` was written at `bb511f8`.

No score, for the reason record 14 gave and this record repeats rather than assumes: the scorecard has
no dimension that asks whether the shipped product works, and the defects that withdrew the 81 were
invisible to every dimension it has. Under rule 4 the 81 therefore remains what `npm run status`
prints, and neither record endorses it. Recording a withdrawal somewhere outside a record is still the
owner's, and still not done.

## What this session verified, and how

Every line below was re-derived by the review seat rather than taken from the building session's
report. Where a claim could not be reproduced, it says so.

| Thing                                   | How it was checked                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The build fix (`221a17c`)               | `describeAbnormalExit` exercised directly across five cases; app rebuilt and started; webhook still returns `400 missing signature`                                                        |
| AC-11's staleness bound                 | threshold traced to `deps.ts:122-125`, which multiplies `vercel.json`'s cron by `keelblock.billing.json`'s `missedRuns`; `staleness.test.mts` 11/11                                        |
| AC-11 over HTTP (`a9ed24a`)             | `reconcile.spec.ts` run: 401 unauthenticated, 401 wrong token, non-200 stale, 200 fresh                                                                                                    |
| The axe pass (`d681687`)                | planted a broken `htmlFor` on `/projects` — the surface that previously passed every planted defect — got `label (critical) — 1 node(s)`, reverted clean                                   |
| That the axe pass runs on every push    | `testDir: './e2e'`, `npm run journey` is bare `playwright test`, runs in the `check` job, which triggers on push and pull_request                                                          |
| The grant gate (`fb4d171`)              | four grants planted on the live catalog and revoked; `grant all … to service_role` caught, `grant select, insert, update` stays green; catalog diffed identical afterwards, 48 grants      |
| The harness instrumentation (`b39db1b`) | tripped a real gate with an unused message key; `locale.log` and `locale.rerun.log` both written with the real reason                                                                      |
| SPEC-007's write path                   | `service_role` holds nothing on any tenant table; `stripe_event` is RLS-forced with zero policies and zero app grants                                                                      |
| Storage isolation                       | settled by execution in a rolled-back transaction: `supabase_storage_admin` sees 2 of 2 rows through a policy permitting 1; residue afterwards `buckets=0 objects=0 policies_on_objects=0` |
| CI and nightly                          | `4e424fd` green; eight consecutive scheduled nightlies green from 2026-09-10 to 2026-09-17                                                                                                 |

## Two corrections the review seat owed

**The F-1 residue is seven tables, not three.** Recorded in record 14 and repeated here because the
error was the review seat's: four schemas were named in the query's predicate and the answer was
complete for the question asked, which was the wrong question. `net` and `supabase_functions` were
never candidates. The corrected sweep is in record 14.

**Three wrong conclusions from truncated output.** A `tail` that cut a README line, a re-run notice
below the cut, and — differently — the schema count above. F-92 groups all three as reading a
truncated copy, and two of them are. The third is not: nothing was clipped, the domain was narrowed in
the predicate. The prescribed fix — write the run to a file and read the file — catches the first two
and would not have caught the third. That distinction is stated here because the prescription attached
to it is load-bearing.

## Open at the close

**One finding, this commit.** `SPEC-015`'s scope section says Core Web Vitals is _"Not deferred to a
date — deferred to the event, below."_ What is below says one more deferral _"is expected"_. There is
no registry row: `4e424fd` adds exactly one, `DEF-033`, which is the WCAG 2.2 move. So the scope
section asserts a deferral that does not exist, and nothing will ever fire for the field half.
`check-deferrals` reports "no orphan markers" and is right — there is no marker to orphan, which is
the gap. AGENTS.md's rule is explicit that not doing something is a registry row with a
machine-evaluable trigger, and the honest paragraph in the Deferrals section is not one.

**Owner's, unchanged through the session.** Running DEF-024's trial, for which the package is now
written and committed (`6e1d15b`, `docs/review/TRIAL-B11-HUMAN.md`). Three dispositions —
`DEF-011`, `DEF-012`, `DEF-029` — which `spec-done:SPEC-007` fires. Three Vercel secrets. Publishing
`create-keelblock-app`, without which B-1's headline command still fails for every user. Publishing
F-1. The score marker.

**`DEF-011`'s trigger is mis-keyed and was not corrected.** Its text says it earns its keep "the moment
money math exists"; it fires on `spec-done:SPEC-007`. No money math exists — the only arithmetic in
`src/lib/billing/` is `* 3600` and `* 60` in `staleness.ts`. This is F-59's defect, live.

**Unverified by the review seat, in either direction.** S-13's inherited default privileges; SHA-pinning
the 32 mutable action tags; the freshness gate tracking 12 of 32 declared dependencies; whether any
storage measurement differs on hosted Supabase, which cannot be checked because no hosted project
exists; and memo 17's external sources, which were read as quoted rather than opened.

## The two themes

**Theme 3 is answered on its own terms and unanswered as a mechanism.** Measured on the definition
used by the review of 2026-09-10 — `scripts/` lines over `src/` lines excluding tests:

```
3.87 (review, 114 commits)  ->  4.04 (peak)  ->  3.01 (this commit)
marginal since the review: scripts +1,749, src +1,374  ->  1.3 : 1
```

Both below where the review found them. The turn came from the owner's scope decision on 2026-09-14,
not from any property of the repository, and nothing here would notice if the next twenty commits
reversed it.

**Theme 4 is exactly where it was.** Nobody outside this project has used it. `DEF-024` now blocks
`SPEC-012`'s AC-8 and `SPEC-024`'s status, gates B-11 and B-5, and is the only open item that would
say whether any of this works for somebody who is not its author. The trial package removes the last
excuse that was not a person.

## For whoever reads this next

Start with `npm run status` and `npm run check`. This record is a frozen claim about `4e424fd` and is
stale the moment anything lands; the gates are computed. Where they disagree with anything above, they
are right.

The method that worked, every time it was used: re-run the measurement rather than re-read the report.
Every correction in this record — the seven tables, the storage owner bypass, the unexercised cron
route, the axe scan reading the shell — came from executing something, and none came from reading it
more carefully.
