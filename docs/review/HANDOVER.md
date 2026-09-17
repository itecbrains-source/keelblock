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

## Where the work is — paused 2026-09-14, resuming in a few days

Pointers and dates only. No counts, for the reason at the top of this file.

**Last shipped.** SPEC-007 REQ-1 at `bb511f8` — the entitlement row, its policy, and the status map
that reads it. Billing moved `draft` -> `partial`. `npm run status` has the rest and is the authority.

**The one part of SPEC-007 that needs no Stripe account.** AC-2: _"a parsed rule: no module on a
request path imports the Stripe client — the same shape as the service-role boundary in
`boundaries`."_ Measured 2026-09-14: nothing under `src/` imports `stripe`, so that rule **passes on
the day it lands**, which is the standard ADR-023 set when it deferred the consistency gate. Every
other open criterion here — Checkout, the webhook, idempotency, reconciliation, the portal — waits on
an account. If you want one thing to pick up cold, it is that rule.

**Parked, with exactly one question.** The storage spike behind SPEC-018: does `storage-api` assume a
constrained role per request? Memo 16 measured everything else and could not settle this, because
`SET LOCAL ROLE` is transaction-scoped and the connection idles between uploads. It needs one real
upload while sampling `pg_stat_activity`, or that service's source. It decides whether a policy on
`storage.objects` is an enforced boundary or a convention, which is the sentence SPEC-018 turns on.

**Owner-gated, not a session's to do.** The three Vercel secrets; publishing `create-keelblock-app`
(B-1's headline command still fails for any user until it is published, and F-74's fix does not reach
anyone before that); publishing F-1; and whether `npm run status`'s score line gets a withdrawal
marker, since the withdrawal exists nowhere in the repository.

**The dated horizon.** Nothing expires within days. The cluster is late October, and the first item is
not only about this repository:

| when           | what                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2026-10-22** | The freshness pins were verified 2026-09-07 against a 45-day limit. **Every generated project's build starts failing on that date, not just this one** — the stamp ships with the scaffold. |
| **2026-10-23** | `DEF-016` fires — review the pinned Supabase CLI version.                                                                                                                                   |
| **2026-12-08** | `DEF-024` fires — the human half of the handover trial.                                                                                                                                     |

**A known local flake, so nobody re-derives it.** `failure-message.test.sql` inside the `policy`
gate has deadlocked — `AccessExclusiveLock` on `auth.users` against `RowExclusiveLock` on
`public.organization` — twice in five runs on 2026-09-14, and not at all in four runs on 09-17 or
three on 09-17 after a reset. The one thing that differed was **local stack uptime**: days on the day
it failed, hours on the days it did not. Correlation, not demonstration, and stated that way
deliberately. If it holds, two things follow: consecutive green scheduled nightlies are **not**
evidence against it, because CI always starts a fresh stack — and the person who meets it is a
developer on day three of the same `supabase start`. Ruled out by execution, do not re-derive: F-1's
TRUNCATE assertion is not the cause, because the privilege check precedes lock acquisition and
returns `permission denied` without ever taking a lock.

**Open, and not feature work.** Themes 3 and 4 of the 2026-09-10 external review. Theme 3 asks for a
mechanism that can fail when the project overspends on itself; the marginal ratio of `scripts/` to
`src/` was measured rising, and every candidate gate would land on the wrong side of it. Theme 4 is
that nobody has used the product. Neither is answerable by another fix, and successive seats have
deliberately declined to close them with tactical work.

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
