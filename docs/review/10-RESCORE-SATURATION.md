# Re-score after the proof harness closed — 2026-09-08

```yaml
record: 10
commit: 34783fc
date: 2026-09-08
score: 72
```

**Sixth dated record.** The series scored `9c0721c`, `de36d49`, `2ca6ef3`, `e4e840e`, `dc7a89d` and
`2c3e9c7`. None is edited.

**Verdict: the score did not move, and that is the finding.** Three commits of good work — SPEC-002
closed, the field scan repaired, six undecided things decided — scored **zero**, because every one of
them landed on a dimension already at maximum or on something this rubric has no dimension for.

The headline number also drops from 80 to 72. **That is the instrument being corrected, not the
project regressing**, and the correction is explained before anything else so it cannot be misread.

## The re-anchoring, first

`09` scored 80. That used rungs for D4 and D9 calibrated against **keelblock's own trajectory** —
"more product surface than last time", "more adoption than none". Valid for tracking one project
across commits, and invalid the moment the same rubric is pointed at the field, which a competitive
pass did.

Field-anchored, product surface is 2 of 5 against kits shipping billing, admin, email, storage,
notifications and three frameworks; adoption is 1 of 5 against four thousand stars. Applying that:

| Frame                             | at `2c3e9c7` | at `34783fc` |
| --------------------------------- | ------------ | ------------ |
| Longitudinal (records 04–09)      | 80           | 80           |
| **Field-anchored (from here on)** | **72**       | **72**       |

**The series switches to field-anchored permanently.** Two scales measuring one thing is how a number
becomes decoration, and the field-anchored one is the only version that means anything to a reader
who is choosing between products. Earlier records stand as written; this is the conversion.

This is the third instrument correction in the series and the pattern named in `09` holds: every one
has been in the generous direction.

## What landed, and what was verified

Three commits: `9a3ff6b` closed SPEC-002's last three criteria, `1856a59` repaired the field scan
from clones rather than from published pages, and `34783fc` decided the six undecided things and
fixed a race.

Checked at `34783fc` by running the rules directly rather than trusting their descriptions:

| What                                       | Result                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AC-11** — a suite that cannot pass empty | **Real.** An all-denied report — the shape an empty fixture also produces — yields problems with the right message; a healthy report yields none; and a stale `UNRELIABLE` entry that excuses nothing is reported too                                                                                                                                     |
| **AC-10** — the claim runs on nothing paid | **Real, and it reasons about its own vacuity.** It rejects "assert no paid component is installed" because the repository has never contained one, so the check would pass on the day someone wired the paid CLI in. It declares every external executable the gates invoke with its licence, resolving tools held in constants rather than only literals |
| The six decisions                          | All six resolved to an ADR, a spec row or a written refusal                                                                                                                                                                                                                                                                                               |
| Working tree, sync, gates                  | clean, synced, green                                                                                                                                                                                                                                                                                                                                      |

**Not executed:** anything needing a database. Unchanged, and still the standing limit on this
instrument's authority.

Two of the six deserve naming, because they went past what was asked. **ADR-016** refuses Basejump's
`personal_account` flag not on taste but because it is a branch inside `is_org_member` and
`is_org_admin` — the two functions every policy consults — with F-40 as a fresh receipt for what a
subtle wrong answer there costs; and it names what is given up rather than only what is kept. And the
**ADR-006 erasure addendum** settles, before billing exists, that billing rows are not immortal and
that a stored customer id is a reference to data held by a processor nobody here controls. That is
the cheapest those two decisions will ever be.

## The finding: this rubric has saturated where keelblock is strong

D1, D2, D3 and D5 are all at maximum. That is **55 of 100**, and they are the four dimensions the
project was built to win. They can now only fall.

So the two best pieces of work in this window are invisible to the score:

- **AC-11 strengthens the layer the entire claim rests on.** A suite whose every assertion expects a
  refusal is equally green against a database with nothing in it — that is the same defect as F-13
  and F-41, generalised into a rule with a positive control per command. It scores nothing, because
  D1 was already 5.
- **AC-10 gave ADR-009's anti-degradation rule a form that can fail.** It had been `planned` since
  SPEC-002 was written and it is the load-bearing promise of the entire commercial model — the free
  tier is complete, and a gate says so. It scores nothing, for the same reason.

And the six decisions score nothing at all, because **there is no dimension for "decisions are
recorded."** An undecided thing is a future argument; converting six into decision records with their
rejected options is durable value that D10 only gestures at and that a bus factor of one caps anyway.

**This is a fact about the instrument, not a criticism of the work.** But it changes what the number
is for. From here the score can only be moved by building product, adopting users, or proving
upgradability and removability — and a flat reading across three strong commits is the most credible
evidence this series has produced for a claim it has been making since record 06.

## The re-score

`04-SCORECARD.md`'s dimensions and weights, unchanged; D4 and D9 field-anchored as above.

| #   | Dimension          | Weight | Score | Note                                                                                                                          |
| --- | ------------------ | ------ | ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| D1  | Isolation, proven  | 20     | 5     | At ceiling. SPEC-002 closing made it better-founded and could not make it score higher                                        |
| D2  | Stranger can check | 15     | 5     | At ceiling                                                                                                                    |
| D3  | Self-honesty       | 10     | 5     | At ceiling — and earned again this window, including correcting the reviewer                                                  |
| D4  | Product surface    | 15     | 2     | Field-anchored. Auth, organizations, membership, invitations. No billing, email, storage, jobs, notifications, admin          |
| D5  | Rot resistance     | 10     | 5     | At ceiling. The field scan being re-verified from clones is the same discipline applied to knowledge rather than dependencies |
| D6  | Upgradability      | 10     | 1     | Unchanged across six records. The largest single block of unearned ground                                                     |
| D7  | Removability       | 5      | 1     | Unchanged. ADR-017 argues SPEC-014's file-deletion test is as strong as package boundaries; it is still unbuilt               |
| D8  | Handover           | 5      | 3     | Unchanged. B-11's trial with a non-author remains undone                                                                      |
| D9  | Adoption           | 5      | 1     | Field-anchored. Names held, no package published, no users                                                                    |
| D10 | Maintainability    | 5      | 4     | Held. Six decisions recorded is a real gain; a bus factor of one and a growing decision surface are what keep it off 5        |

**Total: 72 / 100**, unchanged from `2c3e9c7` on the same anchoring.

Twenty-eight points remain: D4 (9), D6 (8), D7 (4), D9 (4), D8 (2), D10 (1).

## Where the reviewer was wrong

`09`'s companion analysis listed dark mode as an untracked gap. It was already built —
`prefers-color-scheme` overrides plus dozens of `dark:` variants across the components — and the
genuinely undecided thing was a **toggle**, which needs persistence read before first paint and
therefore collides with Cache Components. ADR-018 records that, and says the premise was wrong in
both directions.

The error is worth keeping because of its class: **the gap was diagnosed by searching documentation
for a feature, and the evidence lived in the stylesheet.** That is evidence naming the wrong
artifact, which is R-3 and AC-3c — the defect this reviewer has now raised twice against the
repository and committed once against it.

## The caveat from record 09, arriving on schedule

`09` warned that the journey layer was young and that a suite which stays green without going flaky
is a habit rather than evidence, naming F-42 as the failure that starts one.

**F-44 is that, one window later.** CI turned a documentation-only push red on a test that had been
green for a week: `page.content()` read the DOM while the route was client-side redirecting. The
response is the right one — twice is a class, not bad luck, and the rule drawn is sharper than "add a
wait": when the page is going to navigate, assert on the **response**, not the DOM. Verified over
three consecutive runs.

Two flakes of one class in two windows is worth continuing to watch. The next one should be treated
as evidence about the suite's design rather than about the test that failed.

## What this score cannot see, and the one thing that would change it

The standing limitation is unchanged and now compounding: **this reviewer cannot run the database**,
so D1 rests on CI's records and on reading the suites. Every scoring error in this series has been in
that dimension and in the generous direction.

There is one thing on the board that is neither feature work nor already at ceiling, and it is the
cheapest remaining item: **SPEC-002's Definition of Done still asks for someone other than the author
to plant a policy defect and confirm the harness caught it.** Defects have now been planted in the
gates by this reviewer, in the policies by a Postgres image change, in the application by the journey
layer's first run, and in a documentation push by a race. None of those is a person who did not write
the code, trying to break it on purpose.

It is two points on D8. It is also the only measurement that could still surprise this series in
either direction, and after six records of scoring a project against evidence it publishes about
itself, that is the number worth buying next.
