# Re-score after organizations and the journey layer — 2026-09-08

```yaml
record: 08
commit: dc7a89d
date: 2026-09-08
score: 76
```

**Fourth dated record.** `04-SCORECARD.md` scored `9c0721c`, `05-VERIFICATION.md` re-checked at
`de36d49`, `06-RESCORE-CI.md` scored `2ca6ef3`, `07-RESCORE-AUTH.md` scored `e4e840e`. None is
edited. This scores `dc7a89d`, five commits later.

**Verdict: upgrade. 69 → 76 — and four of those seven points are a correction to this reviewer's own
scoring, not new work.** The decomposition is below, because a score that rises by reinterpretation
is worth less than one that does not move at all.

## What landed

Five commits, three of them substantial: SPEC-005 (organizations, roles, membership, the first
protected route), the fourth test layer, and a fix to the record gate this reviewer wrote badly.

The claim is now demonstrable rather than only provable. Two accounts, two organizations, through the
running application — including the case that matters, a member holding another organization's
identifier in their own cookie and still seeing nothing.

## Verified independently

Checked at `dc7a89d`, in the working tree and by planting defects:

| What                                             | Result                                                                                                                                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Working tree clean, `HEAD == origin/main`        | confirmed                                                                                                                                                                               |
| Seven runnable gates                             | green                                                                                                                                                                                   |
| Journey suite uses no CSS selector or test id    | confirmed by search — **but nothing enforces it**, see below                                                                                                                            |
| The fixture's `service_role` usage               | legitimate: auth-user creation and final deletion only; everything between runs as the user                                                                                             |
| The loopback guard                               | present, and refuses before a single row is written                                                                                                                                     |
| `docs/TESTING.md`, cited by two criteria, exists | confirmed — it did not, and now does                                                                                                                                                    |
| The Supabase RBAC claim in memo 08               | **verified against the primary source**: the guide does recommend the JWT-claim pattern via the access-token hook, and carries no warning about staleness, revocation or token lifetime |

That last one was checked because a public statement about another vendor's documentation is exactly
where F-21 bit last time. It survives.

**Not executed:** anything needing a database — the pgTAP suites, the access matrix, and the journey
run itself. Those rest on CI and on the implementation's evidence, never on this reviewer watching
them run.

## The fixture is the best thing in this change

Worth naming precisely, because the reasoning generalizes past this repository.

The first version reached for `service_role` and was refused `42501`, because migration
`20260908150000` had already decided that the role holds nothing on tenant tables until something
needs it. The available move was to grant it so the fixture could seed. That was refused, and the
fixture now creates auth users — the one thing that role legitimately does — and performs everything
after that **as the user it belongs to, through the same RPC and the same policies the application
uses.**

So the seeding exercises the product instead of going behind it, and the fixture cannot fabricate a
state the product would not produce. A test harness that can write rows the application could never
write is a harness that proves things about a database rather than about a system. **Being refused
produced a better design than being granted would have**, and the file records that where the next
person will read it rather than leaving it as folklore.

Two supporting details that carry their own weight: a loopback guard that refuses before any write,
because "the cost of getting that wrong once is somebody's production data, and care is not a
control"; and cleanup performed by the owner identity, so teardown is itself subject to the policies.

## What the layer found on its first run

**F-39.** A second sign-in request inside the throttle returns `429`; the action swallowed it and
returned "a sign-in link is on its way." No email, nothing logged, and the person waits for something
never sent.

The diagnosis is the valuable half and it is correct: the swallow was deliberate and half right.
Anti-enumeration requires hiding whether an **account** exists, not hiding that the **provider**
refused — and a throttle keyed on the address just typed discloses nothing the typist does not
already know.

The part worth carrying into every project: three green test layers, a spec with twelve criteria, a
verified end-to-end round trip and a ten-path manual smoke test all missed it, because **every one of
them walked the happy path once.** Nobody asks for a second link while testing.

**F-38**, from the previous commit, is the companion argument and the stronger one. A unit test
asserted the protected route calls the data access layer and redirects; it passed, correctly; and the
HTTP status was `200` the whole time, because under Cache Components the shell is flushed before
session-dependent code runs. It generalizes beyond keelblock — any Next.js project with Cache
Components and a `redirect()`-based check has it, and the visible symptom is indistinguishable from
working.

Two findings, one week apart, that only a browser could see. The journey layer paid for itself before
it was finished.

## The correction this reviewer raised, and how it was answered

`07`'s prompt flagged that DEF-002's trigger had been restated to `decided:journey_layer_build` — a
form the registry's own text calls the one to be suspicious of, because it never fires on its own.
The item that would catch F-38-class defects had moved from a trigger that had fired to one that
could not.

It was closed by building it rather than by re-triggering it. That is the right answer to the
objection and the only one that does not leave a row nobody will surface.

## One finding

**SPEC-002's AC-3c is marked `done` and cites code that complies rather than a check that fails.**

The criterion reads: `e2e/pages/index.ts` and `e2e/fixtures/auth.ts` — every locator resolves by
role, label or accessible name; no CSS selector and no test id appears in the suite.

Reproduced:

```bash
printf "\nexport const smuggled = (p: any) => p.getByTestId('org-name');\n" >> e2e/pages/index.ts
node scripts/check-boundaries.mjs; node scripts/check-contracts.mjs; node scripts/check-promises.mjs
npx tsc --noEmit
# every gate exits 0; tsc is clean; nothing in the repository reads the e2e suite
```

This is R-3's class, recurring: **evidence that names the compliant file instead of the failing
check.** It matters more than most instances because accessible locators are the only reason the
journey suite doubles as an accessibility regression test — bar B-7 is partly resting on a property
nothing verifies. The next person who reaches for a test id, because a control has no accessible
name, gets a green build at exactly the moment the coverage disappears.

The rule needs to be parsed rather than grepped: the strings appear inside the comments that explain
the rule, which is F-20's trap waiting in the obvious implementation. It belongs inside an existing
gate.

## The re-score

`04-SCORECARD.md`'s rubric and weights, unchanged.

| #   | Dimension          | Weight | Was | Now   | Why                                                                                                                                                                  |
| --- | ------------------ | ------ | --- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Isolation, proven  | 20     | 4   | **5** | **A correction, not new work — see below.** All four layers ADR-005 names now run in CI, and the result is published                                                 |
| D2  | Stranger can check | 15     | 5   | 5     | Held                                                                                                                                                                 |
| D3  | Self-honesty       | 10     | 5   | 5     | Held, and load-bearing this round: REQ-7 was weakened to what was measured rather than kept at what read better, and both new findings are the project's own defects |
| D4  | Product surface    | 15     | 2   | **3** | Sign-in, organizations, membership, a switcher and a protected route, with journeys executing in CI. No invitations, no billing, no email beyond the link            |
| D5  | Rot resistance     | 10     | 5   | 5     | Held                                                                                                                                                                 |
| D6  | Upgradability      | 10     | 1   | 1     | Unchanged. Nothing built                                                                                                                                             |
| D7  | Removability       | 5      | 1   | 1     | Unchanged                                                                                                                                                            |
| D8  | Handover           | 5      | 3   | 3     | `docs/TESTING.md` now exists and two criteria stop citing a missing file. Still no trial with a non-author, which is what B-11 asks for                              |
| D9  | Adoption           | 5      | 3   | 3     | Unchanged. Names held, no package, no users                                                                                                                          |
| D10 | Maintainability    | 5      | 3   | 3     | The e2e layer is new surface, well documented; the unenforced AC-3c is the smell pulling the other way                                                               |

**Total: 76 / 100.** From 36 → 45 → 61 → 69 → 76.

### The decomposition, because it matters

- **+3 from work.** D4, 2 → 3.
- **+4 from correcting this reviewer's own scoring.** D1, 4 → 5.

`07` capped D1 at 4 with the reason _"proven over three tables and a `project` example; the path to 5
is SPEC-005/006 growing the matrix."_ **That criterion is not in the rubric.** The scale's 5 is
"verified automatically and published, so a stranger sees the result without asking," which isolation
has satisfied since CI went green — and breadth of surface is what D4 measures. The cap was D4's
weakness being counted twice, once under its own name and once inside D1.

Recorded rather than quietly repriced. A rubric whose scorer adds unwritten criteria mid-series is
not measuring anything, and this is the second time this series has had to correct its own
instrument.

## Where the remaining points are

Twenty-four points, and the distribution has not changed in shape: **D6 upgradability (8), D7
removability (4), D4's remaining surface (6), D8's non-author trial (2), D9 adoption (2).**

Nothing on that list moves without building. There is still no cheap move on this board, and there
has not been since `06`.

**The one to bring forward is D6.** `PRODUCT.md` argues, correctly, that upgradability is the deepest
structural failure in the whole boilerplate category and the thing no competitor answers. It is now
the single largest block of points and it has been at 1 for four records. It also constrains how
every feature after it is written, which is the argument for doing the small version early — tag a
release, scaffold from it, land a security fix upstream, prove the scaffolded project can take it.
Doing that once, badly, is worth more than a polished `keelblock upgrade` in month nine.

## Caveats on this score

- **No database was run by this reviewer.** D1's move rests on CI's records and on reading the
  suites, not on watching pgTAP or Playwright execute. That is the dimension working as designed —
  the 3→4 step exists precisely so the witness is not the author's laptop — but it is stated rather
  than implied.
- **The journey layer has run a handful of times.** Seven journeys passing on a runner is evidence;
  a suite that stays green and does not go flaky is a habit, and habits take weeks. The determinism
  exclusion list in `gate-health` is the place to watch if it starts.
- **B-11 is still open**, and SPEC-002's Definition of Done still asks for the thing nobody has done:
  someone other than the author planting a defect in the **policies** and confirming the harness
  caught it. Defects have now been planted in the gates by this reviewer, in the policies by a
  Postgres image change, and in the application by the journey layer's first run. None of those is a
  person who did not write it, trying to break it on purpose.
