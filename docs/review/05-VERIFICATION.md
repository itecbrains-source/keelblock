# Verification of the dispositions

**Independent check of `DISPOSITIONS.md`, run 2026-09-08 by the reviewer, against `de36d49`.**

`DISPOSITIONS.md` is the implementer's account of what was fixed. This is a second account, produced
without reading that table first, by the person who wrote the findings. The two agree. Where they do
not, or where this check could not reach, it says so.

This document is part of the frozen record. It is **not** a governing document, it adds no `R-*`
finding — the register enumerates findings from `01-AUDIT.md` alone — and it is dated because a
verification is a claim about a commit, not about a project.

## Method

The repository's own discipline, applied to the repository: **restore the defect and assert the gate
goes red.** A gate that has only ever printed a tick after a fix has not been shown to be looking at
the thing that was fixed.

Every mutation was performed in a **clean clone at `HEAD` in a temporary directory**, never in the
working tree — a session that mutates a repository another session is editing is producing a
different kind of finding. Each mutation was reverted and the baseline re-confirmed green before the
next.

```bash
git clone <repo> /tmp/cc && cd /tmp/cc
# for each finding: plant the original defect, run the gate, expect non-zero, restore
```

## Findings verified by planting the defect

Nine of the twelve implemented findings are executable without a database. All nine went red, with a
message naming the file and the fix.

| Finding  | Defect planted                                                         | Result                                                                                 |
| -------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **R-1**  | `"The suite runs six gates today."` appended to `README.md`            | red — _"says 'six gates', but there are 11"_. The spelled-out form is now read         |
| **R-2**  | a second cited path in an evidence cell made to not exist              | red — names the missing file, so the first-path-only hole is closed                    |
| **R-3**  | a `done` criterion's evidence replaced with prose carrying no path     | red — _"cites nothing checkable… name the file that proves it"_                        |
| **R-4**  | synthetic report with a cross-tenant `SELECT` leak, unadjudicated      | red. Also red for a junk allowance (`"ok"`) and for an allowance matching nothing      |
| **R-7**  | a gate whose test file carries only `// TODO: add a MUTATION proof`    | red — and red again for a `MUTATION`-named case that no longer calls the gate          |
| **R-8**  | `src/app/[locale]/api/leak/route.ts` importing the service-role client | red — full chain printed                                                               |
| **R-9**  | `const getProjects = async (userId) => { 'use cache'; … }`             | red — the arrow form is seen                                                           |
| **R-10** | `export * from '../supabase/server-only/admin'` behind a barrel        | red — `page.tsx → lib/queries/index.ts → admin.ts`                                     |
| **R-12** | a gate returning the degraded status                                   | renders `~` not `✓`; exit 0 permissively, **exit 1 under `--strict`**, which CI passes |

Two of these are stronger than the finding asked for:

- **R-7** was reported as "a comment satisfies the check". The fix does not merely require a named
  case — it requires that case to **call something the gate exports**, so a mutation proof that has
  quietly stopped exercising its rule is caught too. That failure mode was not in the finding.
- **R-9/R-10** were reported as three missing syntactic forms and three missing import forms. The fix
  replaced the regexes with a TypeScript AST pass, which closes the enumerated cases and the
  unenumerated ones together.

**R-11** could not be mutated without a database, so the rule was transcribed and probed directly.
It is now _"does this `WITH CHECK` mention the tenant key"_, with an explicit refusal of the
null-test shape. `supabase/tests/intent/004-schema-guard.test.sql` mutation-proves five spellings —
`true`, `1=1`, `auth.uid() is not null`, `organization_id is not null`, and the correct form — against
a live stack. **Two of those the audit's own recommendation would have let through**, so the
implemented rule is better than the reviewed one.

## Verified on a clean clone

The register itself was checked the same way, at `HEAD`, in a fresh clone:

| Mutation                                         | Result                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| a disposition row deleted                        | red — _"R-9 (MEDIUM) has no disposition"_                               |
| an `implemented` row made to cite a missing file | red — _"the fix was moved or removed and this register did not notice"_ |

A risk that existed while this work was in flight has closed on its own: `check-promises.mjs`
imports `./review-register.mjs`, and for a period that module and `docs/review/` were untracked. A
clean clone in that state died with `ERR_MODULE_NOT_FOUND` — confirmed by cloning it. `de36d49`
commits all of them together, and the clean clone now runs the gate to completion. Noted because the
window was real, not to assign fault: **a gate that imports an untracked module is green on the
author's machine and broken everywhere else**, which is the same class as R-13.

## What this check could not reach

Stated first rather than last, because a verification that hides its limits is doing the thing the
review exists to stop.

- **No database.** `R-5` and `R-6` rest on a live stack and were **not executed**. The adjudications
  in `keelblock.access-allowances.json` read as sound and cite reproductions (F-27, F-28), and
  `supabase/tests/intent/wrong-helper.mutation.test.sql` exists and is shaped correctly — but this
  reviewer watched neither run. **They are accepted on the implementer's evidence, not confirmed.**
- **`vitest` did not run** on the review machine, for an unrelated platform reason. The meta-gate's
  rule was therefore exercised through its exported function rather than through the suite.
- The two `deferred` findings were checked for _form_, not outcome: `R-13 → DEF-003` and
  `R-14 → DEF-015` both name open deferrals, and the register requires them to be re-answered when
  those close. Whether the deferrals are the right call is a judgement, and this reviewer agrees with
  both.

## One discrepancy, unresolved

`docs/ACCESS-MATRIX.md` lists, under bypass surfaces:

> `organization` — dual write path: … **authenticated holds a direct INSERT/UPDATE/DELETE grant** on
> it.

Migration `20260908130000_revoke_vestigial_insert_grant.sql` revokes exactly that INSERT grant, and
the allowance answering this row says:

> PARTIALLY CLOSED 2026-09-08 … **the flagged INSERT half is gone**.

**Those three statements cannot all describe one database.** Either the matrix was rendered before
the migration reached the local stack — in which case `npm run check` will now report it STALE, and
the mechanism is working exactly as designed — or the prober composes that sentence from a template,
in which case the allowance's claim is not checkable from the artifact a stranger reads, which is
the property the artifact exists to have.

**One command settles it**, and it needs a database this reviewer does not have:

```bash
supabase start && npm run check      # does `generated` report the matrix stale?
```

If it is staleness, regenerate and the discrepancy disappears. If it is a template, the allowance
should say so — _"the INSERT grant is revoked; the prober's dual-write sentence is static and still
names it"_ — because an adjudication that describes a state the artifact does not show is the shape
this whole mechanism exists to prevent.

## Residual, and deliberately minor

Not defects, and not re-openings. Recorded so they are chosen rather than missed.

- **The tenant-key rule still admits two tautologies.** `organization_id = organization_id` mentions
  the key, and `(organization_id IS NOT NULL) AND true` escapes the anchored null-test pattern. No
  static rule catches every tautology — which is the argument for the intent layer, and is why this
  is a note rather than a finding.
- **A message inconsistency.** In a re-export chain the boundaries gate prints the final hop as an
  absolute path while earlier hops are repository-relative. Cosmetic, in a gate whose output quality
  is a stated requirement (SPEC-002 REQ-8).
- **The register is inert until a review exists.** `check-promises.mjs` skips the block when
  `01-AUDIT.md` is absent. That is correct — no review, nothing to answer — and it means the closure
  check protects this repository and nothing scaffolded from it. That is the right default and worth
  knowing when `DEF-010` decides which gates ship to a buyer.

## Work that went past the review

Recorded because a verification that only grades the answers misses what the answering found.

- **F-28 — a role that can destroy a table it cannot read.** `service_role` held `TRUNCATE`,
  `REFERENCES` and `TRIGGER` on all three tenant tables and no DML at all. RLS does not apply to
  TRUNCATE, so no policy limits it. This is a genuine security finding, it is not in the audit, and
  it was found by making the access matrix able to fail — which is to say the fix for R-4 immediately
  paid for itself.
- **F-26, F-27, F-29, F-30** — including the adjudication that both matrix anomalies were prober
  false positives, denied at the _privilege_ layer before RLS was consulted. The audit hypothesized
  this for the UPDATE cell (R-5, from F-5's silent no-op) and could not test it. It was tested.
- **`nightly.yml`'s `range-drift` job.** `npm ci` installs the lockfile exactly, so it can never
  surface a dependency that changed behavior inside an accepted caret range; only a fresh resolution
  can. That is a better argument for nightly than SPEC-002 REQ-6 makes, and it came from building it.
- **ADR-015 and the rename**, with the availability control recorded rather than the conclusion
  alone.

## Score, re-run

Using `04-SCORECARD.md` unchanged, and **without a database**, so this is a floor rather than a
reading:

| Dimension           | Was    | Now     | Why                                                                              |
| ------------------- | ------ | ------- | -------------------------------------------------------------------------------- |
| D3 Self-honesty     | 2      | 4       | Every stale count removed rather than corrected, and the gate now sees the form  |
| D2 Stranger-check   | 2      | 3       | The evidence can fail on its content, and every concern is answered in public    |
| D8 Handover         | 2      | 3       | `AGENTS.md` corrected, plus a handover and a register a stranger can act on      |
| D10 Maintainability | 2      | 3       | Three regex rules replaced by parsers; the machinery-to-code ratio still worsens |
| **Total**           | **36** | **~45** |                                                                                  |

Everything else is unchanged, and unchanged for one reason. **D1 is capped at 3, D5 at 2, D9 at 0
because nothing here has ever executed anywhere but one laptop.** Eleven commits of gate work,
mutation-proven, and not one has run in CI.

The scale's own definition is the argument: the step from 3 to 4 is _"verified automatically, on
infrastructure the author does not control."_ `R-13` is correctly deferred — creating a remote is
not a code change — but it is now the only thing between this repository and the high forties, and
every day of further gate work is a day of work that cannot be scored.

## What this document does not establish

That the isolation claim is true. It establishes that **the machinery which would notice if the claim
stopped being true now goes red when it should** — which is a different and smaller statement, and
the largest one available without a database.

The validation note SPEC-002 still carries remains the real bar, and it is still open:

> _someone other than the author planted a policy defect and confirmed the harness caught it._

This review planted defects in the **gates**. Nobody has yet planted one in the **policies** except
the author. That is one day of a Postgres specialist's time, and it is still the cheapest credibility
this project can buy.
