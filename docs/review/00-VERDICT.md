# Verdict

```yaml
record: 00
commit: 9c0721c
date: 2026-09-08
```

## What keel is

A multi-tenant B2B SaaS starter for Next.js 16 / React 19 / Supabase / Stripe, MIT-licensed, whose
single differentiating claim is that **tenant isolation is enforced by the database and proven by
tests that run on every commit** — with the proof published as a generated access matrix a stranger
can read without trusting anyone.

That is the product. Everything else in the repository — the specs, the decision records, the
deferral registry, the gate suite, the computed status command — exists to keep that claim true as
the code grows.

It is a real idea, it is unoccupied, and the reasoning behind it is better than anything else in this
category. Which is what makes the rest of this document worth reading.

## What actually exists, measured

Not what the specs plan. What is in the working tree at `9c0721c`:

| Layer                                         | Lines   | What it is                                                      |
| --------------------------------------------- | ------- | --------------------------------------------------------------- |
| Prose (`.md`)                                 | 4,124   | product definition, decision records, specs, memos, findings    |
| Gate scripts (`scripts/*.mjs`)                | 2,293   | the enforcement apparatus                                       |
| Gate tests (`scripts/*.test.mts`)             | 1,613   | mutation proofs over the apparatus                              |
| Generated policy suite (`supabase/tests/rls`) | 1,577   | machine-written, committed                                      |
| **Application source (hand-written)**         | **501** | middleware, env schema, security headers, i18n wiring, one page |
| Generated database types                      | 414     | machine-written, committed                                      |
| Migrations                                    | 309     | the tenancy schema and its invariants                           |
| Intent tests (pgTAP)                          | 303     | the adversarial layer                                           |
| Application unit tests                        | 135     | env schema and security headers                                 |

The rendered surface of the application is **one page**, in one locale, with eleven message keys. There
is no login. There is no organization switcher. There is no Stripe call. The Supabase clients exist
and are imported by nothing — the repository knows this and files it as `DEF-004`.

The ratio that matters: **prose and enforcement machinery outweigh application code roughly eight to
one.** That is not automatically wrong — the ordering argument in `spec/README.md` is genuinely
correct, and building the harness first is the rarer and braver choice. But it is the number that
frames every other finding here.

## The context that reframes everything

`git log` reports **forty commits, all dated 2026-09-07**, between 14:04 and 22:08.

The whole project — the product definition, fourteen decision records, five authored specs, the
migrations, the intent suite, eleven gate scripts with mutation proofs, the findings register, the
commercial model — is **one working day**.

Read the repository knowing that and two things change. First, the output is extraordinary and the
review should say so plainly rather than grading it as if it were a year of work. Second, every
defect in [`01-AUDIT.md`](01-AUDIT.md) is the predictable failure of writing the rulebook and the
referee in the same afternoon: **the gates were built faster than anything existed for them to
check, so several of them have never met their subject.**

## Verdict

**The thesis is right. The apparatus is not yet load-bearing, and the front page is currently
false.**

Three sentences, each of which is reproduced in the audit:

1. The gate that exists to stop documentation going stale is **defeated by spelling a number in
   words**, and seven claims in `README.md`, `PRODUCT.md` and `AGENTS.md` are wrong today —
   including the first thing a visitor reads about the evidence.
2. The governing claim in `PRODUCT.md` — proven "on every commit and every night" — is **not
   implemented**: there is no nightly workflow, the criterion asserting one is marked `done` citing a
   file that does not exist, and the gate that checks evidence reads only the first path in the row.
3. `docs/ACCESS-MATRIX.md`, the artifact the entire claim rests on, is **committed carrying two
   unexplained anomalies and a CRITICAL bypass row**, and no gate in the repository can fail on
   either — the check compares text for staleness and nothing else.

None of these is fatal. All three are cheap to fix. What is dangerous is the pattern they share:
**keel currently certifies itself green while its own published evidence says otherwise**, which is
precisely the failure mode it was built to eliminate, and the one thing it cannot be caught doing in
public.

There is also a fourth item that is not a defect but a fact, and it is the most expensive one in this
review: **`create-keel-app` is already published on npm by someone else**, and `keel` is an actively
maintained, venture-funded developer-tools product. See [`03-POSITIONING.md`](03-POSITIONING.md).

## What is genuinely world-class

Said without hedging, because the criticism above is only useful if the praise is honest.

- **The ordering decision.** Building the proof apparatus before the login screen is correct, is
  argued from a real failure mode ("a proof retrofitted onto working code confirms what that code
  already does"), and essentially nobody does it. This is the single best decision in the repository.
- **`docs/FINDINGS.md`.** Measured discoveries with reproductions, including the project's own
  mistakes. `anon` holding TRUNCATE on a default Supabase project, the generated RLS suite reporting
  a leaking table green, the strict-CSP trilemma, `NEXT_PUBLIC_` on a credential — these are real,
  they are checkable, and **no competitor can publish them because none of them did the measuring.**
  This file, not the starter, is the most valuable asset in the repository.
- **Publishing your own defects.** F-8, F-13 and F-25 are keel breaking its own rules, published with
  the same prominence as the wins. That is the credibility mechanism, and it is rare enough to be a
  moat on its own.
- **The deferral registry with machine-evaluable triggers.** "A defect is never a deferral" plus a
  trigger that fails the build when its moment arrives is the best solution to scope-debt drift this
  reviewer has seen in a repository of this size.
- **`npm run status`.** Durable claims written down, volatile state computed. The rule is right even
  though the enforcement has the hole described in R-1.
- **Three commands, three questions.** `check` / `verify` / `preflight` separating _is this correct_
  from _will CI pass_ from _is this safe to release_ is a distinction most engineering organizations
  never make explicit.

## The five things that would kill this project

In order of how quickly they arrive.

| #     | Risk                                                                                                                                                                                                                                                                    | Where                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **1** | **A visitor checks the evidence and it does not hold.** The audit found the front page wrong in seven places and the flagship artifact carrying unexplained anomalies. One screenshot ends the project's credibility permanently, because credibility _is_ the product. | [`01-AUDIT.md`](01-AUDIT.md) R-1, R-4    |
| **2** | **The name is taken, twice.** `keel` and `create-keel-app` are both live on npm, and Keel is a funded developer-tools company. Bar B-1's headline command scaffolds somebody else's project.                                                                            | [`03-POSITIONING.md`](03-POSITIONING.md) |
| **3** | **Nothing has ever run.** There is no git remote. The workflow has never executed; `verify` honestly reports 45% local fidelity against a file that has never been a gate. Every claim about CI is currently a claim about a YAML file.                                 | [`01-AUDIT.md`](01-AUDIT.md) R-13        |
| **4** | **The governance outruns the product indefinitely.** Eight-to-one is defensible for one day. At three months it is the project, and a starter with no login is not a starter.                                                                                           | [`02-EXECUTION.md`](02-EXECUTION.md)     |
| **5** | **The maintenance promise is unbacked.** keel's differentiator is that it will not rot. It is one person, and the freshness gate expires every forty-five days by design. Who moves those dates in month eighteen?                                                      | [`02-EXECUTION.md`](02-EXECUTION.md)     |

## If I had one week

In this order, and nothing else:

1. **Fix the seven false counts and close the gate hole that let them through** (R-1). Two hours.
   Until this is done every other claim in the repository is discounted by a careful reader.
2. **Create the remote and push.** This converts twelve asserted gates into observed ones, closes
   `DEF-003`, and turns `verify`'s honest 45% into a real number. Half a day.
3. **Explain or fix the anomalies in the access matrix, and make the count gate the build** (R-4,
   R-5). The artifact is the product; it cannot ship with warnings nobody has answered.
4. **Settle the name** before `create-keel-app` appears in one more document. Candidates, the
   availability check that produced them, and the reason single-word `.dev` names are a dead end are
   recorded in [`03-POSITIONING.md`](03-POSITIONING.md).
5. **Build the login screen.** Not because auth is interesting, but because `SPEC-004` unblocks four
   deferrals, the journey layer, and the first thing anyone can actually look at.

Everything else in this review can wait a quarter. Those five cannot.
