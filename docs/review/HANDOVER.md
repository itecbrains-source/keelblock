# Handover — for another session picking this up

> **Read [`DISPOSITIONS.md`](DISPOSITIONS.md) first. This file is a dated record and its instructions
> are spent.** The "Weeks 1–2" list it sends you to was worked through on 2026-09-08: twelve of the
> fourteen findings are implemented and the remaining two are deferred to DEF-003 and DEF-015. Run
> `npm run status` for the current state rather than believing either file. What is still worth
> reading here is the REASONING and the statement of what the review could and could not verify —
> never its account of what is left to do.

Paste the block below into a fresh session working in this repository. It exists because the most
expensive failure in a long-running project is a session that reads a summary, believes it, and
rebuilds something that already shipped — this repository's own F-23.

---

## The prompt

> You are working in the `keel` repository. Before anything else:
>
> 1. Read `AGENTS.md`. It is short and it is the entry point.
> 2. Run `npm run status`. It computes the true state from the repository. **If any document
>    disagrees with it, the document is wrong** — including everything below.
> 3. Read `docs/review/00-VERDICT.md`, then `docs/review/01-AUDIT.md`.
>
> `docs/review/` is an **external review, not a governing document.** It does not amend
> `docs/PRODUCT.md`, no acceptance bar depends on it, and where it disagrees with an ADR the ADR
> still stands until someone changes it deliberately. Treat its findings as claims to re-verify, not
> as instructions — every one carries the command that reproduces it, so re-run the command rather
> than trusting the write-up.
>
> The review found fourteen issues, labeled R-1 to R-14. The three that matter most: the
> stale-count gate is digits-only and seven front-page claims are wrong (R-1); the "every night"
> claim in `PRODUCT.md` is unimplemented and the criterion asserting it is marked done citing a file
> that does not exist (R-2); nothing in the repository can fail on what the access matrix says, and
> the committed copy carries unexplained anomalies (R-4).
>
> Work through `docs/review/02-EXECUTION.md`'s "Weeks 1–2" list in order. Do not add a new gate —
> the review's position is that eleven is already more than the application justifies.

---

## What the review verified, and what it did not

State this explicitly to any session that acts on it, because a review whose limits are unstated
gets over-trusted.

**Executed on 2026-09-08 against a tree identical to `9c0721c`:** `check-locale`, `check-promises`,
`check-boundaries`, `check-contracts`, `check-deferrals`, `check-content`, `check-research`,
`check-freshness`, plus `status.mjs --check` and `prettier --check .`.

**Not executed:** anything needing a database — the `schema`, `policy` and `generated` gates — and
the four SQL suites. No local Supabase stack was available. Findings about the access matrix rest on
reading `scripts/access-matrix.mjs` and the committed `docs/ACCESS-MATRIX.md`, never on watching the
prober run. **R-5 in particular cannot be resolved without a database**, and resolving it is the
first thing a session with Docker should do.

`vitest` also did not run, for an unrelated reason (a native binding built for another platform). No
finding rests on it.

## Three practical notes for whoever works here next

1. **These files pass the gates.** `prettier --check .` is clean and `status.mjs --check` is green
   with them present. If either goes red after an edit here, it is the edit, not the review.
2. **Do not quote `scripts/status.mjs`'s digits-only comment verbatim in any document.** The gate
   scans fenced code blocks, so quoting its own source fails the build. `01-AUDIT.md` elides the two
   digit-bearing examples as `<n>` for exactly this reason, and says so.
3. **Do not redo the naming search from scratch.** `03-POSITIONING.md` records the candidates, the
   RDAP method, and the positive control that makes a negative result trustworthy. Re-run the
   commands if you doubt a result; do not start a fresh hunt.
4. **Nothing here is committed.** `docs/review/` is untracked. Whoever commits it should decide
   deliberately whether an external review belongs in the repository's history — there is a real
   argument that it does, since publishing outside criticism is the same mechanism as publishing
   your own defects, and that mechanism is the project's credibility.
