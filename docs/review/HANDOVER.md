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

## Where the work is — 2026-09-17, handing to a fresh session

Pointers and dates only. No counts, for the reason at the top of this file.

**Where SPEC-007 stands.** `partial`, and the webhook increment landed: the entitlement row and its
policy (REQ-1, REQ-7), the event ledger schema (REQ-5), the delivery verifier and the route. Six of
its eleven criteria are done. `npm run status` has the current split and is the authority.

**Next, in dependency order**, and the first one needs no Stripe account:

1. **AC-2** — "no module on a request path imports the Stripe client". A parsed rule, and **reuse
   `check-boundaries`'s existing import traversal rather than writing a second walk.** F-78 is the
   reason that sentence is here: the service-role walk matched one syntax out of four until it was
   derived, and a parallel hand-rolled walk inherits the same class of hole. The Stripe client sits
   in exactly one file today, deliberately, so the allowlist this rule needs is one entry.
2. **AC-8** — a journey: an organization is refused a paid surface, then granted it. The first thing
   in this spec that produces a **visible product surface**, which is the half this project has least
   of.
3. Then reconciliation: AC-6, AC-4, AC-11.

**The grant that is coming, and what is waiting for it.** Wiring the handler's dependencies needs the
service-role client (imported by nothing today, DEF-004) and will be the first migration to grant
`service_role` writes on a tenant table. F-80's rule watches for `TRUNCATE`; F-81 is the record of
what happens if that grant arrives before its consumer — one premature grant made `service_role` a
probed identity on every tenant table and returned five suites' worth of `UNRELIABLE`. Two assertions
in `007-entitlement.test.sql` are written knowing they must change on that day.

**Owed and not done.** Nothing. The README banner correction that was going to ride the next push
went in with this one (F-82), because a session that ends with an owed edit is a session that loses
it.

**One thing unexplained.** A single `npm run check` reported `unit` failing with no test named,
followed by six consecutive green runs. The hypothesis is prettier rewriting files as vitest starts
in the same command chain; it was not reproduced. If it recurs, that hypothesis is the first thing to
test — and note that a real flake hid behind exactly this shape once already: F-72's safety test was
spawning processes on every unit run and was intermittently red for as long as it existed.

**A known local flake, so nobody re-derives it.** `failure-message.test.sql` inside the `policy` gate
has deadlocked — `AccessExclusiveLock` on `auth.users` against `RowExclusiveLock` on
`public.organization` — twice in five runs on 2026-09-14, and not in any run since on a stack that
had been reset recently. The variable that differed was **local stack uptime**. Correlation, not
demonstration. If it holds, consecutive green scheduled nightlies are **not** evidence against it —
CI always starts a fresh stack — and the person who meets it is a developer on day three of the same
`supabase start`. Ruled out by execution, do not re-derive: F-1's `TRUNCATE` assertion is not the
cause, because the privilege check precedes lock acquisition and returns `permission denied` without
taking a lock.

**Owner-gated, not a session's to do.** The three Vercel secrets; publishing `create-keelblock-app`
(B-1's headline command still fails for any user until it is published, and F-74's fix reaches nobody
before that); publishing F-1; and whether `npm run status`'s score line gets a withdrawal marker,
since the withdrawal exists nowhere in the repository.

**The dated horizon**, re-measured 2026-09-17. Nothing expires within weeks:

| when           | what                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2026-10-22** | Freshness pins expire — 35 days out. **Every generated project's build starts failing then, not just this one**, because the stamp ships with the scaffold. |
| **2026-10-23** | `DEF-016` fires — review the pinned Supabase CLI version.                                                                                                   |
| **2026-12-08** | `DEF-024` fires — the human half of the handover trial.                                                                                                     |

The nearest research memo expiry is 80 days out, so no memo needs re-verifying this month.

**Open, and not feature work.** Themes 3 and 4 of the external review of 2026-09-10. Theme 3 asks for
a mechanism that can fail when the project overspends on itself; the marginal ratio of `scripts/` to
`src/` was measured **falling** for the first time on the entitlement commit — 10.0:1 down to 5.8:1 —
because that increment was mostly `src/` and `supabase/`. One commit is not a trend and the webhook
increment should continue it; re-measuring after is the only evidence either way. Theme 4 is that
nobody has used the product. Neither is answerable by another fix, and four successive seats have
declined to close them with tactical work.

**Three findings declined a gate on purpose** — F-69, F-82 and the count claims in F-78. Each names
why in its own entry. A session that reads them as oversights and builds the gates will be spending
on the wrong side of the ratio above.

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
