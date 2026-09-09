# Testing

Four layers. Each proves something the others cannot, and each is honest about what it does not see.

| Layer                                 | Answers                                             | Cannot see                                                                 |
| ------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| **unit** (`vitest`)                   | is this function correct?                           | anything about the database, and anything about a real HTTP response       |
| **generated** (`rlsautotest` → pgTAP) | does every policy DELEGATE as declared?             | **every line inside the helper it delegates to** — the tool says so itself |
| **intent** (hand-written pgTAP)       | is the policy WHAT WE MEANT?                        | whether the application ever calls it                                      |
| **journey** (Playwright)              | does the real authenticated flow work in a browser? | anything not on a path a person walks                                      |

The boundary between the middle two is the one that matters and it was measured, not assumed: the
generated suite reported a **total cross-tenant leak as green**, because it verifies wiring and
mocks the helper (F-2). keelblock puts the membership predicate inside exactly such a helper, so the
intent layer is the only thing testing the predicate at all.

## Running them

```bash
npm run check      # everything except the journey layer
npm run journey    # the journey layer, against a built app and the local stack
```

`check` runs the journey layer in CI but not locally: the journey layer drives a browser, and a
browser is the one dependency worth not requiring of every local run. Locally you run it when you
have changed something a person touches.

**Amended 2026-09-09.** This paragraph used to give the reason as the build — "it builds the
application first, which takes longer than every other gate combined". Both halves are now false.
`check` builds the application itself since F-52, and the build was measured at 11-16s against a rest
of the suite nearer a minute, so it never took longer than everything else combined. The browser is
the real reason, and it was always the real reason.

**In a git worktree, install into it** — `npm ci --ignore-scripts` inside the worktree, not a symlink
to the parent's `node_modules`. Turbopack refuses one: _"Symlink [project]/node_modules is invalid,
it points out of the filesystem root"_. That was already known — it is finding 2 of the handover
trial below — but it cost a trial participant its build back when the build was optional. Since F-52
made `build` a step, it turns `npm run check` red for a reason that has nothing to do with the code,
and this repository runs its trials in worktrees.

## The journey layer

**It exists because of [F-38](FINDINGS.md).** A unit test asserted that the protected page calls
`getCurrentUser` and redirects. It passed, correctly, and could not see that the HTTP status was
`200` and the page chrome was served — because under Cache Components the shell is prerendered and
flushed before session-dependent code runs. Three green layers, and the fourth is what noticed.

Two rules, both settled before the first test was written:

**Accessible locators only** — `getByRole`, `getByLabel`, `getByPlaceholder`. Never a CSS selector,
never a test id (SPEC-002 REQ-3b). Adopted from `boxyhq/saas-starter-kit`, whose suite does this
throughout. The payoff: a control that loses its accessible name breaks a test, so the suite is an
accessibility regression test for everything it touches, and bar B-7 is partly held by tests written
for another reason.

**The fixture owns its data, and cannot reach anything that matters.** It refuses to run against a
non-loopback database before writing a row — because the SPEC-005 walk was once done by hand against
the development stack, left two organizations and fourteen users behind, and broke the policy gate's
mutation proof, which counts rows.

It also seeds **through the product's own paths**, as ordinary users. The first version reached for
`service_role` and was refused `42501`: migration `20260908150000` deliberately revoked everything
from that role, because _"a grant to it is a deliberate act tied to a real consumer."_ Granting it so
a fixture could seed would arm the most powerful role in the system for a test. So the fixture states
only what a test genuinely chooses — how many people, how many organizations, and labels the
assertions look for — and everything else is computed by the thing under test: identifiers by the
database, the owner membership by `create_organization`, the invariants by their triggers.

## What a timed local run looks like

Recorded 2026-09-08, on the machine that wrote this, against the built application and a warm stack:

```
npm run check      ~35s   every gate, including 81 pgTAP assertions across 9 files
npm run journey    ~17s   7 tests, one of which spends an auth email
```

The journey number excludes `next build`, which the Playwright web server runs first and which
dominates a cold run at roughly 20 seconds.

**Re-timed 2026-09-09, after `next build` became a step (F-52).** Five cold runs on the machine that
wrote this, with a warm stack:

```
build step        11-16s   its own line in the summary, median ~12.6s
npm run check     51-120s  total, over three consecutive cold runs
```

**Quote the first number and distrust the second.** The build step's cost is stable across runs; the
total is not, and it is not the build that moves it — one run finished the whole loop _with_ the build
in 51s, faster than a run measured the day before without it. On a laptop doing anything else, total
loop time is dominated by what else the laptop is doing. If you want to know whether a step is
affordable, read that step's own line.

**One test can skip, and says why.** Supabase caps auth email at two per hour project-wide
(DEF-019), so the one journey that signs in through the form — rather than by injecting a session —
skips when the quota is spent, naming the count it saw. CI starts a fresh stack, so it never skips
there.

## The upgrade job, and its first green run

B-10's proof is not a document, it is a job: scaffold a buyer at the previous release, let them
diverge, apply the upgrade, and run **today's** suite against what comes out. It lives in
`.github/workflows/check.yml` as `upgrade` and runs on every push.

Recorded here because a badge says only that something passed, and the question worth answering is
what it did. **Run 34282685924, 2026-09-08** — the first execution — read from its log rather than its
result:

```
scaffolding at v0.1.0
Applying migration 20260910090000_buyer_customer_note.sql     ← the buyer's own work
upgrade: took 31 upstream-owned file(s) from db682a9
upgrade: applying migrations with --include-all (see F-45: out-of-order is expected)
Applying migration 20260908160000_invitations.sql
Applying migration 20260908170000_null_safe_is_org_admin.sql  ← the security fix
upgrade: LEFT 33 file(s) alone — they are yours
upgrade: REGENERATE these — they describe YOUR schema, not ours
… 001 ok · 002 ok · 003 ok · 004 ok · 005 ok · 006-invitations ok · failure-message ok
Result: PASS
```

Four things that log establishes and a green tick would not: it scaffolded at a **tag** rather than at
`HEAD` (upgrading HEAD to HEAD is a job that can only pass); the buyer's own migration was applied
**before** the upgrade, so the out-of-order case was actually reached; today's full suite ran,
including the two files that did not exist at `v0.1.0`; and the final step found no change under
`src/` or `messages/`, which is the property that makes the path safe to run unattended.

**The buyer is synthetic.** keelblock has no users and no deployment (DEF-001). This proves the path
works, not that anyone has walked it.

## The handover trial — B-11's agent half, run once

**2026-09-08 · one trial · `30e23c7` · the participant's own report, not a summary of it**

B-11 asks whether _"someone who has never seen this repository … can add a tenant-scoped feature
correctly on their first attempt, and prove it themselves without a reviewer"_, measured on **whether
the gates catch what they get wrong** — not on whether they succeed.

**Protocol.** A fresh agent session, no context but the repository, in a worktree at `30e23c7`. One
brief: _"Add a notes feature. An organization can have short notes. A member can read their
organization's notes and add one. Provide a page at /notes."_ Nothing else — no mention of RLS,
policies, grants, `FORCE`, the gates, or which commands exist, beyond one sentence saying the
repository documents how to check your own work. **No help was given at any point**, per
`research/12-HANDOVER-TRIAL.md`: the facilitator's interference is the method's main threat.

**Two facilitator interventions, recorded rather than hidden:** `node_modules` and `.venv` were
symlinked into the worktree and `.env.local` copied in. That is environment setup a newcomer performs
by following the install docs, not a hint about the task — but it is an intervention, and one of them
had a consequence (see below), so it is stated.

**Duration:** ~34 minutes.

### It succeeded, and that is the less interesting half

It produced the migration, an intent suite, a DAL, a server action, the page, jsdom tests and three
journeys, and ended with the full `npm run check` green. Unprompted, it wrote `force row level security`, the
explicit grant, and `revoke update, delete` so an edit attempt raises rather than becoming a silent
zero-row write; it resolved the organization server-side from the caller's memberships rather than
accepting it as a form field; and it ran its own mutation proof, replacing the policy with
`with check (true)` to confirm its cross-tenant assertion could fail — reproducing F-4 in the process
(_"rows the smuggler can read back = 0"_).

### What told it that it was wrong

- **`generated` and `typecheck`, on the first full run:** _"`src/lib/db/database.types.ts` is STALE …
  Regenerate and read the diff: `npm run generate`"_, and `Argument of type '"note"' is not
assignable`. It reported the messages as sufficient to fix without asking anyone.
- **The journey layer found what the other three layers could not:** the form submitted and the page
  still said "No notes yet". The cause was not its code — hydration was blocked because it served on
  `127.0.0.1` rather than `localhost`. It found this **only by reading the dev-server log**, not from
  the screenshot.
- **A doc comment prevented a flake.** `e2e/pages/index.ts` warns that Next injects its own
  `role="alert"` route announcer and that forms keep an empty live region — F-42's write-up, doing
  the job documentation is for.

### What nothing told it — the measurement

1. **`next build` is run by nothing in `check`.** The production render was never verified. Worse for
   the trial, the journey layer's `webServer` runs `npm run build`, so **CI's actual journey
   configuration never executed**; it ran the journeys against `next dev` instead. Its third notes
   test asserts F-38 behaviour — a production-render property — so dev agreeing with it is weaker
   evidence than the suite intends. **A build-only failure surfaces as "the web server did not
   start", which reads like infrastructure.**
2. **The symlinked `node_modules` made the build impossible** — _"Symlink [project]/node_modules is
   invalid, it points out of the filesystem root"_. A facilitator intervention changed what the trial
   could measure, which is exactly what memo 12 warns about, and it was not foreseen.
3. **It could not tell whether its page's exported-component pattern breaks the default build**, and
   ran a control to establish that it had not introduced the failure it saw. It followed the pattern
   both existing protected pages use.
4. **It could not check its table against the newer Postgres image** CI may pull, where
   `authenticated` holds default DML (F-31). It defended its own table with an explicit `revoke`, and
   noted the same exposure remains untreated on `organization_invitation`.

### What it found in the documentation, and what came of it

Four of its five documentation findings were verified true and **three were fixed in the change that
recorded this trial** — a defect is never a deferral:

- **`CONTRIBUTING.md` misled it about the flagship recipe.** It reported the code block omits `force`
  and the grant. The block does **not** omit them — but the prose beneath said _"Measured on a table
  built exactly as written above: `RLS forced? false`"_, and that sentence was written when the block
  still lacked them and left pointing at the corrected one. **A fix for a documentation defect
  introduced a documentation defect**, and a newcomer read it exactly as written.
- **`verify` measured a different interpreter than the gates use.** `bash -lc 'node -v'` → v25.2.1;
  `node -v` → v26.4.0. `freshness` failed inside `verify` and passed standalone. The test pinning
  this was named _"executes a plain run step exactly as CI would"_ while pinning a **login** shell,
  which is not what GitHub Actions runs.
- **`test-results/.last-run.json` is committed, rewritten by Playwright without a trailing newline,
  and was absent from `.prettierignore`** — so running the journey suite turned `format` red for a
  generated file. Every other generated artifact was already listed.
- **The gate count disagrees with itself:** `npm run check` prints 13 while `npm run status` prints
  `GATES 11`. Not fixed here — it is a naming question about which steps are gates, and worth
  deciding rather than papering over.

  **Decided 2026-09-09** (the trial's report above is left as it was written). They are counting
  different things, and both are right. `status` counts gates by listing `scripts/check-*.mjs` — a
  rule with a mutation proof. `check` counts steps, which include build and test tools that are not
  rules: `typegen`, `typecheck`, `format`, `lint`, `unit`, and now `build`. The numbers should be
  expected to differ, and SPEC-003's ceiling applies to the first.

### The verdict, stated against the count

**One trial. With L ≈ 31%, that finds roughly a third of what is there** — so this is a data point,
not a claim of handover-readiness, and B-11 is claimed at one agent trial with the human half open
(DEF-024). What it establishes: an unfamiliar participant built a correct tenant-scoped feature
unaided, and every mistake it made was named by a gate **except in the one area nothing runs** — the
production build.

## The adversarial trial — DEF-020's policy half, run once

**2026-09-09.** The handover trial above asked whether a stranger can _add_ a feature correctly. This
one asks the opposite question, and it is the one SPEC-002's Definition of Done actually names:
_someone other than the author planted a policy defect and confirmed the harness caught it._

A session with no context was given the schema, the policies, the harness and one instruction:
**plant a defect the suite does not catch.** It was told a miss was the successful outcome, told not
to fix anything, and barred from touching any test or gate — the schema was the target, not the
invigilator. It was required to _demonstrate_ each defect as a signed-in user rather than assert it,
because a change nobody can exploit is not a defect and "the harness missed it" would mean nothing.

**It got through in seven attempts.** The full account, including the two near-misses that are more
interesting than the hit, is [F-53](FINDINGS.md). In short: `project_delete` swapped `is_org_admin`
for `is_org_member`, a plain member deleted a project, and `npm run check` reported all fourteen
green. Both holes are now closed — an intent assertion whose mutation proof is the planted diff, and
a schema guard that reads `USING` and not only `WITH CHECK`.

**Two things about the method are worth keeping.**

The requirement to _exploit_ the defect, not merely plant it, did most of the work. Two of the seven
attempts were genuinely invisible to every gate and still could not leak — one because PostgreSQL
re-applies the SELECT and INSERT policies to the new row during a row-moving UPDATE, one because a
trigger caught the cascade. Without the exploit requirement both would have been filed as harness
failures, and both would have been wrong.

And the failed attempts were the second-most valuable output. "We could not break it" is only
evidence when the attempts are written down; five of these seven were stopped by a named assertion,
and knowing _which_ assertion stopped them is what tells you the coverage is real rather than lucky.

**This does not close DEF-020.** The bar says a second competent person, and a session the author
spawned is not one — the same distinction DEF-024 draws for the human half of B-11. The row stays
open with the trigger it needs. What the trial bought is narrower: an adversary that did not write
the harness got through it, and the reasons it got through are two fewer than they were.
