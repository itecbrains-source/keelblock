# Scorecard

```yaml
record: 04
commit: 9c0721c
date: 2026-09-08
score: 36
```

_A rubric for evaluating a SaaS starter kit — keel or any competitor — on properties that can be
checked rather than admired._

## Why a rubric rather than an opinion

`PRODUCT.md` already refuses "world-class" as unfalsifiable and replaces it with eleven acceptance
bars. This is the same move applied to the review: an external assessment that cannot be reproduced
is worth exactly as much as a testimonial.

Two design rules, both borrowed from the repository:

- **Every dimension names the command or artifact that scores it.** A dimension nobody can measure
  is a preference wearing a number.
- **The rubric scores what is true today**, never what a spec plans. A `planned` criterion scores
  zero. This is uncomfortable for a project that is mostly plan, and it is the only way the score
  means anything.

The rubric is deliberately usable against MakerKit, Supastarter, BoxyHQ or `nextjs/saas-starter`.
A rubric that only one project can score well is a marketing page.

## The dimensions

Ten, weighted. Weights reflect what a buyer of a _multi-tenant B2B_ starter is actually exposed to;
adjust them for a different thesis, but adjust them before scoring, not after.

| #   | Dimension                             | Weight | What it asks                                                                         | Scored by                                              |
| --- | ------------------------------------- | ------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| D1  | **Isolation, proven**                 | 20     | Is cross-tenant access denied per table × command × identity, and demonstrated?      | the policy suite and the published matrix              |
| D2  | **Evidence a stranger can check**     | 15     | Can someone outside the project verify D1 without trusting anyone, and how cheaply?  | time-to-verification, in minutes, from a clean machine |
| D3  | **Self-honesty**                      | 10     | Does the documentation agree with the repository, and are its own defects published? | `npm run status --check`, and the findings register    |
| D4  | **Product surface**                   | 15     | How much of a real SaaS exists and runs?                                             | working user journeys, counted                         |
| D5  | **Rot resistance**                    | 10     | Does staleness fail a build that actually runs?                                      | the freshness gate, on a real CI run                   |
| D6  | **Upgradability**                     | 10     | Can a project scaffolded at `N` take `N+1`'s security fix, provably?                 | a CI job that does it                                  |
| D7  | **Removability**                      | 5      | Can an optional module be deleted in one commit with everything still green?         | a deletion test per module                             |
| D8  | **Handover**                          | 5      | Can a stranger or an agent land a correct change on the first attempt?               | a recorded trial with a non-author                     |
| D9  | **Adoption**                          | 5      | Can anyone find it, install it, and get help?                                        | public repository, published package, resolved issues  |
| D10 | **Maintainability of the kit itself** | 5      | Is the machinery proportionate, parseable, and survivable by a second person?        | machinery-to-application ratio; bus factor             |

**Scale**, applied identically to every dimension:

| Score | Meaning                                                                                |
| ----- | -------------------------------------------------------------------------------------- |
| 0     | Absent                                                                                 |
| 1     | Claimed in prose, nothing backs it                                                     |
| 2     | Implemented, unverified — no test, or a test that has never run                        |
| 3     | Verified locally by the author                                                         |
| 4     | Verified automatically, on every change, on infrastructure the author does not control |
| 5     | Verified automatically **and published**, so a stranger sees the result without asking |

The jump from 3 to 4 is where most projects stop, and the jump from 4 to 5 is keel's entire thesis.

## Today's score

Scored at `9c0721c`, 2026-09-08, against what runs.

| #   | Dimension          | Score | Weighted | Why exactly this number                                                                                                                                                                                                                          |
| --- | ------------------ | ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Isolation, proven  | 3     | 12.0     | Policies, invariants, a generated suite and an adversarial intent layer all exist and were verified locally. Not 4: no CI has ever run. Not higher also because AC-4 — the criterion proving the two layers are not redundant — is unbuilt (R-6) |
| D2  | Stranger-checkable | 2     | 6.0      | The matrix is committed and readable, which is more than anyone else offers. But verifying it needs five tools and a Docker daemon (R-14), and the committed copy carries warnings nobody has answered (R-4, R-5)                                |
| D3  | Self-honesty       | 2     | 4.0      | The findings register, including published own-defects, is category-leading and would score 5 alone. It is dragged down hard: seven false counts on the front page, and the gate that exists to prevent them cannot see them (R-1)               |
| D4  | Product surface    | 1     | 3.0      | One page, one locale, eleven message keys. No login. Zero user journeys work end to end                                                                                                                                                          |
| D5  | Rot resistance     | 2     | 4.0      | The gate is real, well-argued, and caught genuine drift on its first run. It has never run in CI, and its drift rule silently disables itself when the registry looks unreachable (R-12, R-13)                                                   |
| D6  | Upgradability      | 1     | 2.0      | ADR-008 and SPEC-013 argue it better than anyone in the field. Nothing is built                                                                                                                                                                  |
| D7  | Removability       | 1     | 1.0      | Bar B-6 is stated and owned by SPEC-014; no deletion test exists                                                                                                                                                                                 |
| D8  | Handover           | 2     | 2.0      | `AGENTS.md` is genuinely strong and the gates-as-guardrails argument is the best in the category. Untested with a non-author, and the file itself currently misstates the decision record (R-1)                                                  |
| D9  | Adoption           | 0     | 0.0      | No remote, no package, no users. The intended package name belongs to someone else                                                                                                                                                               |
| D10 | Maintainability    | 2     | 2.0      | Exceptional internal documentation and reasoning; ~8:1 machinery-to-application ratio, seven regex-based gates with holes, bus factor of one                                                                                                     |

**Total: 36 / 100.**

### How to read that number

Not as a grade. A one-day-old project scoring 36 with a category-leading D1 argument is a **very
strong start**, and the distribution of the score is the useful part:

- **D1 and D3 are where keel is already better than a funded competitor** — and both are currently
  capped by things that are days of work, not quarters.
- **D4, D6, D7, D9 are near zero**, and every one of them is "not built yet" rather than "built
  wrong". They move with execution, not insight.
- **The cheapest points on the board are D9 and D3.** Pushing to a remote moves D9 from 0 toward 3
  and lifts the ceiling on D1, D5 and D8 simultaneously, because every one of them is capped at 3 by
  "has never run on infrastructure the author does not control". Fixing seven numbers and one regex
  moves D3 from 2 to 4.

**Roughly twenty points are available in two weeks of unglamorous work**, and none of it is feature
work. That is the strongest argument in this review for the sequencing in
[`02-EXECUTION.md`](02-EXECUTION.md).

### The same rubric, applied to the field

Scored from published material only, which is the honest limit of an outside view — and is itself the
point of D2.

| Dimension           | keel  | MakerKit | Supastarter | BoxyHQ | `nextjs/saas-starter` |
| ------------------- | ----- | -------- | ----------- | ------ | --------------------- |
| D1 Isolation        | **3** | 2        | 2           | 2      | 1                     |
| D2 Stranger-check   | **2** | 0        | 0           | 0      | 0                     |
| D3 Self-honesty     | **2** | 1        | 1           | 1      | 1                     |
| D4 Product surface  | 1     | **5**    | **5**       | 4      | 2                     |
| D5 Rot resistance   | 2     | **3**    | **3**       | 2      | 1                     |
| D6 Upgradability    | 1     | 2        | 2           | 1      | 0                     |
| D7 Removability     | 1     | 1        | 1           | 1      | 1                     |
| D8 Handover         | 2     | 2        | **3**       | 2      | 1                     |
| D9 Adoption         | 0     | **4**    | **4**       | **4**  | **4**                 |
| D10 Maintainability | 2     | 3        | 3           | 3      | **4**                 |

Read the shape rather than the totals. **keel leads on exactly two rows and trails on everything
else** — and those two rows are the ones it chose. That is a correct strategy, honestly executed, and
it is also why D9 is the most urgent number on the page: a project that wins two categories nobody
can see wins nothing.

The competitors' D2 scores are zero because none of them publishes an isolation proof. That column
is the whole business, and it is currently a two.

## Making this run

The rubric is prose today, which by this repository's own standard means it will go stale. Six of the
ten dimensions are mechanically derivable from things `npm run status` already reads.

Proposed `npm run scorecard`, sketched:

| Dimension | Machine input                                                                               | Human input                   |
| --------- | ------------------------------------------------------------------------------------------- | ----------------------------- |
| D1        | anomaly count in the matrix; intent-test count; whether the policy gate ran with a database | none                          |
| D2        | wall-clock from clone to a rendered matrix, measured in CI; whether a public URL exists     | none                          |
| D3        | `status --check` exit code; count-claim violations including spelled-out numerals           | none                          |
| D4        | passing journey tests, counted                                                              | none                          |
| D5        | freshness verdict on a run with a network, `degraded` distinguished from `ok`               | none                          |
| D6        | whether the scaffold-and-upgrade CI job exists and passed                                   | none                          |
| D7        | deletion tests present and green                                                            | none                          |
| D8        | —                                                                                           | the recorded non-author trial |
| D9        | remote exists; package published; open-issue response time                                  | none                          |
| D10       | machinery-to-application line ratio; regex-decided gate count; committer count              | bus-factor judgment           |

Eight of ten computed, two recorded by a human with a date and a name. That is the same split
`npm run status` already makes between volatile and durable, and the same rule should apply: **the
computed half is never written down, and the recorded half carries the date it was observed.**

A score that a project computes about itself is not evidence for a stranger — but a score that moves
when the repository moves is a working instrument for the team, and that is what this is for.

## Re-scoring discipline

Three rules, or the instrument decays into a dashboard:

1. **Score what runs, never what is specified.** A `planned` acceptance criterion is a zero. If that
   feels harsh, that is the rubric working.
2. **Change the weights before scoring, never after.** Weights encode the thesis; moving them to
   improve a total is how a scorecard becomes a press release.
3. **Publish the score with its date and its commit**, including the bad ones. The project that
   publishes a 36 and then a 61 is credible. The one that first publishes at 78 is not, and by then
   nobody is checking.
