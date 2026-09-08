# Re-score after CI — 2026-09-08

**A second dated record, written after the remote existed.** `04-SCORECARD.md` scored `9c0721c`;
`05-VERIFICATION.md` re-checked the fixes at `de36d49`. Neither is edited — a score is a claim about
a commit, and correcting an old one destroys the only thing it was for. This scores `2ca6ef3`.

**Verdict: upgrade. 45 → 61.** The move is almost entirely one thing, and it is the thing the
scorecard said it would be.

## What was verified

Independently, not from the repository's own account of itself:

| Claim                            | How it was checked                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| A remote exists and is public    | `github.com/itecbrains-source/keelblock`, MIT, described, topic-tagged, badges rendered      |
| `main` is actually pushed        | `git branch -vv` — `main … [origin/main]`, working tree clean                                |
| CI is green                      | Nine `check` runs, every one success; run `34190042576` shows four jobs green                |
| All four jobs ran                | `check` 2m 42s · `audit` 21s · `codeql` 1m 3s · `secrets` 6s                                 |
| The database-backed gates ran    | `check.yml` runs `supabase start` then `npm run check -- --strict`                           |
| Degraded is treated as failure   | `--strict` is passed in CI, which is what makes R-12's fix load-bearing rather than cosmetic |
| The artifact is what CI produced | `generated-by-this-run` — types, a diff, and the matrix the run itself generated             |

So the twelve steps `npm run verify` could previously only assert are now observed, on infrastructure
the author does not control. That is the precise wording of the scale's step from 3 to 4, and it is
why four dimensions move at once.

## What CI found that nothing else could

**F-31 — a guarantee inherited from a platform default is a coincidence with good uptime.**

The first run failed, in the central claim, on an assertion that had been green on every local run
since it was written. The runner pulled `supabase/postgres:17.6.1.167`; the laptop builds on
`17.6.1.140`. On the newer image Supabase's default ACL grants `anon` DML on public tables again, so
the privilege layer that refuses an unauthenticated role **before RLS is consulted** was gone.

RLS still held — every policy is `to authenticated` — so this was defense in depth, not a leak, and
the finding says so plainly rather than inflating it. The generalizable half is better than the bug:
F-1's fix, which _stated_ the revoke, survived the image change intact. This one did not, because it
had never been written down. It was simply true on the image they happened to run.

This is the strongest available validation of the review, and it is worth naming as such. The audit's
third killer risk was _"nothing has ever run"_, and its recommendation was to push and watch, with
the note that there would be something. There was, on the first attempt, in the claim the whole
project exists to make. **The cheapest recommendation in the review paid for itself the day it was
taken.**

Two smaller things the same push produced, both found without prompting: the artifact upload was
publishing the _committed_ matrix rather than what the run generated — so it could never have shown
a disagreement, which is the only reason anyone would download it — and the Supabase CLI was
unpinned, which made a byte-compared generated artifact a function of a version nobody chose.

## The open discrepancy: narrowed, not closed

`05-VERIFICATION.md` recorded that three statements could not all describe one database:

- the matrix's bypass row says `authenticated` holds a **direct INSERT/UPDATE/DELETE grant** on
  `organization`;
- `20260908130000` revokes that INSERT grant;
- the allowance answering the row says **"the flagged INSERT half is gone."**

It offered two explanations: the matrix was stale, or the prober's sentence is a static template.

**CI removes the innocent one.** `npm run check -- --strict` includes the `generated` gate, which
re-renders the matrix against the live stack and compares it byte-for-byte with the committed copy.
It passed, on a database with every migration applied. The committed matrix is therefore **current**,
not stale — so the sentence naming INSERT is what the tool produces _today_.

That leaves two branches, and one of them is a false security claim:

1. **The prober composes that sentence from a template** and does not re-derive the verb list from
   live grants. Then the artifact is misleading about a resolved concern, and the allowance should say
   so explicitly rather than describing a state the artifact does not show.
2. **`authenticated` still effectively holds INSERT** — reacquired through a default privilege or a
   role grant applied after the revoke. Then the allowance's claim is wrong, and `create_organization()`
   is not the only write path.

**No test in the repository distinguishes them.** `20260908130000`'s own comment cites
`supabase/tests/intent/002` as verification, and that test reads:

```sql
select throws_ok($$insert into public.organization (name,slug) values ('Sneaky','sneaky')$$,
  '42501', null, ...);
```

`42501` covers _both_ `permission denied for table` and `new row violates row-level security policy`,
and the message pattern is `null`, so the assertion passes under either branch. The migration comment
says as much — it treats that coverage as a convenience, where it is exactly what makes the test
unable to confirm the claim being made from it.

**One query settles it**, and it needs the stack:

```sql
select has_table_privilege('authenticated', 'public.organization', 'INSERT');
```

`false` → branch 1: amend the allowance to name the template. `true` → branch 2: the revoke did not
take, and that is a finding. Either way the fix is small; leaving it unanswered is what is not small,
because this is the one row in the published evidence where the artifact and its written adjudication
disagree.

## The re-score

`04-SCORECARD.md`'s rubric and weights, unchanged. Scored from public evidence — GitHub's own run
records — which is the point of the dimensions that moved.

| #   | Dimension          | Weight | Was | Now   | Why it moved                                                                                                                                                                         |
| --- | ------------------ | ------ | --- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Isolation, proven  | 20     | 3   | **4** | The policy suite, intent layer and matrix run on every push, on foreign infrastructure — and the first run found a real regression                                                   |
| D2  | Stranger can check | 15     | 3   | **4** | Public repo, readable matrix, green runs anyone can open. Not 5: seeing which run produced which matrix still means downloading a zip (DEF-015)                                      |
| D3  | Self-honesty       | 10     | 4   | **5** | The stale-doc gate runs in CI on a public repo, and the defect register — including its own — is published. First 5 on the board                                                     |
| D4  | Product surface    | 15     | 1   | 1     | Unchanged. Still one page, still no login                                                                                                                                            |
| D5  | Rot resistance     | 10     | 2   | **4** | Freshness runs in CI under `--strict`, so a skipped rule fails. Not 5: the nightly schedule has not fired yet — the one nightly run was a manual dispatch                            |
| D6  | Upgradability      | 10     | 1   | 1     | Unchanged. Nothing built                                                                                                                                                             |
| D7  | Removability       | 5      | 1   | 1     | Unchanged                                                                                                                                                                            |
| D8  | Handover           | 5      | 3   | 3     | Unchanged. Still no trial with a non-author                                                                                                                                          |
| D9  | Adoption           | 5      | 0   | **3** | Public, described, badged, clean-clone build proven by CI. Not higher: npm `keelblock` and `create-keelblock-app` are still unregistered (DEF-013), zero stars, zero forks, no users |
| D10 | Maintainability    | 5      | 3   | 3     | Unchanged. The parsers are in; the machinery-to-application ratio still worsens                                                                                                      |

**Total: 61 / 100** — from 36 at first review, 45 after the fixes, 61 with CI.

### The prediction, checked

`04-SCORECARD.md` said: _"roughly twenty points are available in two weeks of unglamorous work, and
none of it is feature work"_, and _"pushing to a remote alone lifts four dimensions at once."_

Twenty-five points arrived, and exactly four dimensions moved on the push — D1, D2, D5, D9 — for
exactly the stated reason. The rubric predicted its own movement, which is the only evidence
available that it measures something real rather than describing a mood.

## What this changes about the advice

**The cheap points are spent.** That is the headline, and it inverts the recommendation in
`02-EXECUTION.md`.

Of the thirty-nine points still on the table, twenty-five sit in D4 (product surface, 12 short), D6
(upgradability, 8 short) and D7 (removability, 4 short). **None of them moves without building the
product.** There is no further gate, parser, register or workflow that raises this number — and a
project this good at building governance should hear that as a warning, because the next quarter's
temptation is another beautifully-argued mechanism.

The sequencing in `02-EXECUTION.md` still holds, and its phase boundary has been reached ahead of
schedule: weeks 1–2 were the audit's CRITICAL set plus the remote, and that is done, in a day. **Weeks
3–6 — auth, organizations, invitations — is now the whole job.** SPEC-004 unblocks four deferrals,
the journey layer, and the first thing anyone can look at.

One thing worth pulling forward from later in that plan: **DEF-015**, publishing the matrix and its
run at a URL, is now cheap in a way it was not before. The artifact exists, the run is public, the
matrix is current and gate-enforced. It is D2's remaining point, it is bar B-2's actual delivery
mechanism, and it no longer requires the marketing shell to exist — a single static page would do it.

## Caveats on this score

- **The database was not run by this reviewer.** D1's move rests on GitHub's run records rather than
  on watching pgTAP pass. That is the dimension working as designed — the whole point of the 3→4 step
  is that someone other than the author's laptop is the witness — but it should be stated rather than
  implied.
- **The nightly schedule has not fired.** `nightly.yml` has run once, by manual dispatch. Until a
  scheduled run completes, the mechanism that catches time-based rot is proven only by hand.
- **SPEC-002's validation note is still open.** Defects have now been planted in the gates, by the
  reviewer, and in the policies, by CI's image change. Neither is the thing the spec asks for:
  _someone other than the author deliberately planting a policy defect and confirming the harness
  caught it._ It remains the cheapest credibility this project can buy, and it is now the last item
  on the list that is not feature work.
