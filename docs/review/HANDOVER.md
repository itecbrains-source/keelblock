# Handover — for another session picking this up

**This file is not a record.** The numbered records are frozen dated claims; this one is rewritten
whenever the handover changes, and it is written to point at computed state rather than to restate
it — the last version of this file asserted counts, and counts are what go stale.

---

## The prompt

Paste this into a fresh session working in this repository.

> You are working in the `keelblock` repository. Before anything else:
>
> 1. Read `AGENTS.md`. It is short and it is the entry point.
> 2. Run `npm run status`. It computes the true state — specs, deferrals, findings, the external
>    review's closure, and **which review record is current**. If any document disagrees with it,
>    the document is wrong, including everything below.
> 3. Read the newest record in `docs/review/` — `npm run status` names it — then
>    `docs/review/DISPOSITIONS.md`.
>
> `docs/review/` is an **adversarial review, not a governing document.** It does not amend
> `docs/PRODUCT.md`, no acceptance bar depends on it, and where it disagrees with an ADR the ADR
> stands until someone changes it deliberately. Its findings are claims to re-verify, not
> instructions — each carries the command that reproduces it, so run the command rather than
> trusting the write-up.
>
> **Not external, and the distinction is the folder's own subject.** It was produced by a session the
> owner ran. DEF-020 already draws that line for the handover trial — "a session the author spawned
> is not one" — and calling this external claimed an independence it does not have. A genuinely
> external review, commissioned by the owner with no access to those sessions, arrived 2026-09-10 and
> found defects in shipped code that this folder missed: an open redirect in the auth callback
> (F-70), every page rendering in the browser default serif (F-70), environment validation that
> executed in no process (F-70), a local CI verifier that would have reset the developer's own
> database (F-72), and an invitation journey with no screen wired to it (F-73).
>
> Three standing constraints from the review, which the repository has so far kept:
>
> - **Do not add a gate.** Eleven already exceeds what the application justifies. New rules go inside
>   an existing gate — `boundaries` has taken four this way.
> - **Do not decide from a regular expression over source text where a parser exists.** That class of
>   defect has recurred here more than any other.
> - **Do not edit a numbered record in `docs/review/`.** They are dated claims about specific
>   commits. A new observation is a new record, not an edit to an old one.

---

## What the numbers mean, and where to get them

Nothing in this file states a count. Ask instead:

```bash
npm run status     # specs, deferrals, findings, review closure, the current record and its score
npm run check      # every gate; --strict to fail on a rule that did not run
```

`RECORDS` in that output is the line to read first. It names the newest review record, the commit it
describes, its score, and how far HEAD has moved since. A record behind HEAD is normal and is
reported rather than failed — but it tells you whether the score you are about to quote is current.

## Where the work is — 2026-09-18, handing to a fresh session

Pointers and dates only. No counts, for the reason at the top of this file.

**SPEC-007 is 11 of 11 and still `partial`, deliberately.** Every acceptance criterion is met. Its
Definition of Done still carries an unticked box — a live round-trip against a real Stripe account,
which is owner-gated. Marking it `done` fires DEF-011, DEF-012 and DEF-029 and fails the build until
they are picked up. That is the gate applying the pressure it exists for; leaving it `partial` is the
honest state, not an oversight.

**SPEC-015 was authored this session and is `partial` at 5 of 6.** It owns B-7 and half of B-8, and
it exists because the axe pass built in `d681687` was running on every push while claiming no
acceptance criterion — its registered owners were unauthored.

**Only AC-5 is open, and it is a person rather than a build.** B-7's keyboard walkthrough. The
protocol is written and ready to run — `docs/KEYBOARD-WALKTHROUGH.md`: six states, five passes each,
three rules, and a record section that is empty and says so.

**It does NOT need a stranger, and the two get conflated.** DEF-024 requires somebody who has not seen
the repository; B-7 asks only for a keyboard walkthrough per surface, so the owner can run it. When
the record is filled in, AC-5's evidence points at that file and `SPEC-015` comes out of
`$noDocumentation` — the content gate will ask.

**The lab budget landed with the measurement that justifies its shape.** Bytes rather than a timing,
because a clean build and two incremental builds of an unchanged tree produced byte-identical output —
so the bound needs headroom for growth, not noise. One ceiling over everything the build emits rather
than a per-route list. `keelblock.budget.json` declares it, and every failure message carries the
sentence saying it is a lab measurement and not Core Web Vitals.

**Two flake hypotheses were retired this session, and one mechanism was found.** Do not re-derive any
of it:

- The `policy` deadlock does **not** correlate with local stack uptime (F-83). The short-uptime stack
  failed where the long-uptime one passed. Mechanism still unidentified; F-83 carries a verified
  recipe for recovering the next occurrence from the container log after the test output is gone.
- The `unit` flake was **not** prettier racing vitest (F-84) — `check.mjs` has no concurrency and its
  format step cannot write. A real self-healing mechanism was then found and fixed (F-86): the unit
  suite was regenerating a committed artifact, which made one gate unable to fail.
- And the harness itself was discarding evidence (F-92). `status ?? EXIT.FAILED` collapsed "killed by
  a signal", "never started" and "ran and objected" into one summary line. `npm run check` now keeps
  a failing step's output in a file, says how the step died, and re-runs it once to report whether it
  repeated. **The next unexplained failure should be a diagnosis rather than a fourth hypothesis.**

**A local-only condition, observed while closing this session and not fully explained.** After a long
working session — many `check` runs, journey suites killed mid-run, manual grant experiments, a
deliberate deadlock — the local stack drifted into a state where two gates failed on a tree that had
been green an hour earlier with only a markdown file changed since:

- `policy` — `organization:UPDATE` lost its positive control ("a suite that seeded nothing would be
  just as green");
- `unit` — `gate-health`'s determinism case reported `access-matrix.mjs gave different verdicts on
identical input`, and the harness recorded that it **did not reproduce standalone**.

Both read the live database. `supabase db reset --local` restored all fourteen to green. **What was
not isolated is which drift caused it**, so this is a remedy and a correlation rather than a
mechanism — recorded here rather than as a finding for exactly that reason. CI is unaffected: it
starts a fresh stack every run. If it recurs, the harness now keeps each failing gate's output under
the system temp directory and says whether it reproduced, which is the evidence F-83 and F-84 never
had.

**Owed and not done.** Nothing. The tree is clean and CI is green on `HEAD`.

**One thing prepared and unrun.** `docs/review/TRIAL-B11-HUMAN.md` — DEF-024's human trial, ready to
hand to a participant. It needs a person and an afternoon, and it closes SPEC-012's AC-8 and moves
SPEC-024 off `partial`. It does **not** close B-11, and says so in its own words.

**Owner-gated, not a session's to do.** The three Vercel secrets and `CRON_SECRET`; publishing
`create-keelblock-app` (the README now says plainly that the published package is a placeholder);
publishing F-1; whether `npm run status`'s score line gets a withdrawal marker; and three deferrals
whose own text was re-read this session — **DEF-011's trigger is mis-keyed** (it fires on
`spec-done:SPEC-007` while its text says "the moment money math exists", and there is none), DEF-012
is genuinely arguable now that `constantTimeEquals` exists, and **DEF-029's stated moment has
arrived** — it is the only one of the three that is a product decision, and SPEC-031's account
deletion cannot succeed for a sole owner without it.

**The dated horizon**, re-measured 2026-09-18:

| when           | what                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **2026-10-22** | Freshness pins expire. **Every generated project's build starts failing then, not just this one**, because the stamp ships with the scaffold. |
| **2026-10-23** | `DEF-016` fires — review the pinned Supabase CLI version.                                                                                     |
| **2026-12-08** | `DEF-024` fires — the human half of the handover trial, which now blocks two specs rather than one.                                           |

**Memo 17 is registered `fast` on purpose.** Re-verifying it means reading whether the European
Commission has cited EN 301 549 v4.1.1 in the Official Journal — which is what schedules DEF-033's
look. The deferral records the position; the memo's window is the mechanism.

**Open, and not feature work.** Themes 3 and 4 of the external review of 2026-09-10. Theme 3 has
eased — the marginal ratio is below where that review found it, and the recent gate work fixed real
defects rather than adding apparatus. **Theme 4 has not moved at all.** DEF-024 gates B-11 and B-5,
blocks two specs, and is the only open item that would say whether any of this works for somebody who
is not the owner. No amount of further building changes it.

## Two rules the review's own machinery now enforces

Both live in `scripts/review-records.mjs`, inside the `promises` gate:

1. **A record must name its commit and date** in a header block, and that commit must exist in
   history with the numbering matching real ancestry. A record that cannot say which commit it
   describes is indistinguishable from a current one.
2. **Outside `docs/review/`, a review score is a live claim.** Any document stating a score that is
   not the current one fails the build. Inside a record any score may be discussed, because a record
   says which commit it is about.

Both carry mutation proofs in `scripts/review-records.test.mts`.

## Working alongside a review session

The reviewer and the implementer have run concurrently in this repository more than once, and it has
worked because they touch different files. Keep it that way:

- the reviewer owns `docs/review/`, `scripts/review-records.mjs` and its test;
- the implementer owns everything else.

Two practical notes from the times it nearly went wrong. **Commit a module and its callers together**
— `check-promises.mjs` imports `review-register.mjs`, and for a while that module was untracked, so a
clean clone died with `ERR_MODULE_NOT_FOUND` while every local run was green. And **re-run
`npm run check` immediately before committing** if a review session has been active, because the
working tree may contain someone else's finished work as well as yours.

## What the review cannot see

Stated so a session acting on it does not over-trust it.

**Corrected 2026-09-14, and the correction matters more than the original claim.** This said "the
reviewer has no database". That was true of an earlier seat and is not true of the current one, which
reported running the four database gates, `vitest`, the GitHub API and Playwright headless. Do not
tell an incoming reviewer to concede those — ask what their environment actually does, because the
answer has now changed twice and each seat has been explicit about it unprompted.

What has held across every seat is narrower and worth keeping: a reviewer states what it could not
check, every time, rather than letting a green list imply coverage. Two specific things a reviewer
here could not see, both found later by execution: `_external-review-2026-09-10/` is in
`.git/info/exclude`, so it is invisible to `git status` and a clean tree can be incomplete; and
`gh run watch --exit-status` has returned 1 on a run the API reports as `success`, so the API is the
authority and the exit code is the weaker signal. Defects have been planted in the **gates**, by the reviewer, and in the
**policies**, by CI's Postgres image changing underneath a green suite (F-31).

Neither is the thing `SPEC-002`'s Definition of Done still asks for:

> _someone other than the author planted a policy defect and confirmed the harness caught it._

That remains open, and it is the last item on the board that is not feature work.
