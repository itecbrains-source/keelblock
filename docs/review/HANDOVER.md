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
> `docs/review/` is an **external review, not a governing document.** It does not amend
> `docs/PRODUCT.md`, no acceptance bar depends on it, and where it disagrees with an ADR the ADR
> stands until someone changes it deliberately. Its findings are claims to re-verify, not
> instructions — each carries the command that reproduces it, so run the command rather than
> trusting the write-up.
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

The reviewer has no database. Every finding about policies, the pgTAP suites, the access matrix and
the end-to-end flows rests on this repository's own evidence and on CI — never on the reviewer
watching them run. Defects have been planted in the **gates**, by the reviewer, and in the
**policies**, by CI's Postgres image changing underneath a green suite (F-31).

Neither is the thing `SPEC-002`'s Definition of Done still asks for:

> _someone other than the author planted a policy defect and confirmed the harness caught it._

That remains open, and it is the last item on the board that is not feature work.
