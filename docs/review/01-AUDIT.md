# Audit

Fourteen findings, ordered by severity. Each carries the command that reproduces it, run on
2026-09-08 against a working tree identical to `9c0721c`.

The convention matches the repository's own: **a finding is not believed until it is reproduced.**
Where a check could not be executed, the finding says so and rests on source and committed output
only.

Severity is against keel's own claim, not against a generic codebase:

- **CRITICAL** — the claim is currently false, or its evidence is currently wrong.
- **HIGH** — a gate cannot catch the defect it exists to catch.
- **MEDIUM** — a gate has a hole that will open when the code reaches it.

---

## R-1 · CRITICAL — the anti-stale-documentation gate is defeated by spelling the number out, and the front page is wrong in seven places

`scripts/status.mjs` verifies that no document asserts a count that has gone stale. It is the
mechanism behind F-23, and its rule is deliberately digits-only. The comment states the reasoning:

```js
// "<n> findings", "**<n>** gates", "twelve ADRs" is not matched — digits only, deliberately:
// a spelled-out number is almost always prose about the concept, not a claim about the count.
```

_(The two digit-bearing examples in that comment are elided above as `<n>`: the gate scans fenced
code blocks along with prose, so quoting its own source verbatim in any document fails the build. A
small thing, and a real one — a rule you cannot document inside the repository it governs will be
documented wrongly.)_

**That premise is false in this repository, and measurably so.** keel's documentation is written in
literary prose, and it spells almost every count out. Every stale count in the repository today is
therefore invisible to the gate designed to catch stale counts.

Reproduction:

```bash
npm run status                       # the true census
grep -rn "eight findings\|Sixteen areas\|six gates\|twelve gates\|thirteen areas\|six acceptance bars\|eleven decisions" \
  README.md docs/PRODUCT.md AGENTS.md
node scripts/status.mjs --check      # prints: ok — no document asserts a count that has gone stale
```

What is wrong right now:

| Document         | Claim                               | Reality                                                                         |
| ---------------- | ----------------------------------- | ------------------------------------------------------------------------------- |
| `README.md:52`   | "eight findings, each with a repro" | the register runs to F-25                                                       |
| `README.md:66`   | "Sixteen areas"                     | `PRODUCT.md` lists nineteen                                                     |
| `README.md:116`  | "runs six gates"                    | `check.mjs` `STEPS` has thirteen entries; `scripts/check-*.mjs` is eleven files |
| `PRODUCT.md:138` | "the same twelve gates"             | eleven                                                                          |
| `PRODUCT.md:164` | "Scope — thirteen areas"            | nineteen items are listed directly beneath the heading                          |
| `PRODUCT.md:253` | "All six acceptance bars"           | the bar table runs to B-11                                                      |
| `AGENTS.md:76`   | "eleven decisions"                  | `docs/adr/` holds fourteen                                                      |

Two of these deserve separate attention.

**`AGENTS.md` is the agent's entry point.** It tells a coding agent that the decision record holds
eleven decisions. An agent that trusts it will not look for ADR-012, ADR-013 or ADR-014 — which
between them settle framework portability, the entire toolchain, and UI conventions. This is the
exact failure F-23 was written about, in the exact file F-23 was found in, still present.

**`README.md:116` is worse than a wrong number.** It is followed by a fenced block showing six ticks
as the output of `npm run check`. A reader who runs the command sees thirteen. The first thing keel
shows a stranger about its own verification is a transcript that cannot be produced.

And the README opens with:

> _This README describes what exists today, not what is planned. If that distinction ever blurs, the
> project has failed its own first rule._

**The fix is not to correct seven numbers.** F-23 already found the right answer and it was not
applied consistently: stop asserting counts in prose and cite `npm run status`. The gate should be
changed to match — parse spelled-out numerals up to twenty, or, better, **fail on any count claim
next to a countable noun regardless of form, and offer the command as the fix.** A gate whose stated
justification is an empirical claim about how humans write should be tested against how this
repository actually writes.

---

## R-2 · CRITICAL — the central claim promises nightly proof; there is no nightly workflow, and the criterion asserting one is marked done citing a file that does not exist

`docs/PRODUCT.md` states the one claim:

> _Tenant isolation is enforced by the database and **proven by tests that run on every commit and
> every night.**_

`README.md` repeats it. Bar B-2's proof column says "in CI and nightly".

Reproduction:

```bash
ls .github/workflows/                # check.yml — and nothing else
grep -n "cron" .github/workflows/check.yml
#   - cron: '0 6 * * 1'              # weekly, Monday 06:00 — and its own comment says "Weekly"
grep -n "AC-7" spec/SPEC-002-proof-harness.md
#   | AC-7 | REQ-6 | inspection | `.github/workflows/check.yml` and `nightly.yml` | **done** |
node scripts/check-contracts.mjs
#   contracts: ok — 5 spec(s), 10 reciprocal contract(s), all evidence present
```

Three failures stacked, and the third is the one that matters:

1. There is no nightly run. The schedule is **weekly**, and `check.yml`'s own comment calls it a
   weekly clean-clone build. SPEC-002 REQ-6 argues nightly matters _independently_ — it catches the
   caret-range dependency that changed behavior, and the drift no commit triggered. A weekly run
   catches that up to seven days late.
2. `nightly.yml` does not exist, and AC-7 is marked **done** while citing it.
3. **The evidence gate cannot see it.** `scripts/check-contracts.mjs` extracts one path per
   criterion:

   ```js
   /^\|\s*(AC-[\w.]+)\s*\|[^|]*\|[^|]*\|\s*`([^`]+)`[^|]*\|\s*\*{0,2}([\w ]+?)\*{0,2}\s*\|/gm;
   ```

   A single capture group. The row cites two files; the gate checks the first, finds `check.yml`,
   and reports "all evidence present". **A criterion can cite any number of missing files as long as
   its first one exists.**

Confirm the parse directly:

```bash
node -e "import('./scripts/check-contracts.mjs').then(async m=>{const fs=await import('node:fs');
  const s=m.parseSpec('SPEC-002', fs.readFileSync('spec/SPEC-002-proof-harness.md','utf8'));
  console.log(s.evidence.find(e=>e.ac==='AC-7'));})"
# { ac: 'AC-7', path: '.github/workflows/check.yml', status: 'done' }
```

This is the repository's own F-20 — a check that matches text will eventually match the wrong text —
recurring in the gate whose job is to stop specs drifting from their build.

**Fix:** capture every backticked path in the cell, not the first; and either build `nightly.yml` or
change the claim in `PRODUCT.md` to say weekly. The claim is the more urgent half. It appears in the
first paragraph of the product definition, and it is not true.

---

## R-3 · HIGH — evidence checking is opt-in by formatting: two closed criteria are skipped entirely

The same regex requires a backticked path. A criterion whose evidence cell contains no backticks is
not parsed at all — it does not appear in the evidence list, so it is never checked, and its absence
is silent.

```bash
node -e "import('./scripts/check-contracts.mjs').then(async m=>{const fs=await import('node:fs');
  const s=m.parseSpec('SPEC-003', fs.readFileSync('spec/SPEC-003-gates.md','utf8'));
  console.log('parsed:', s.evidence.map(e=>e.ac).join(' '));})"
# parsed: AC-1 AC-2 AC-3 AC-4 AC-5 AC-6 AC-9
```

SPEC-003 has nine acceptance criteria. **AC-7 and AC-8 are marked done and are invisible to the
gate**, because their evidence is written as prose ("Playbook gates wired, with a proof for each: an
orphan `@defer`, a REQ with no AC, a dead source path") rather than as a path.

The failure mode is exactly backwards from what a reviewer expects: **the more prose an author writes
in the evidence cell, the less the gate checks.** Nothing reports the skip, so the gate's summary
line — "all evidence present" — is true only of the rows it happened to parse.

There is a related trap waiting in SPEC-028, where the parser reads the backticked token `hreflang`
as a file path. Those criteria are `planned`, so nothing fires today. On the day they are marked
done, the gate will demand a file named `hreflang`, and the fastest way to make it green will be to
remove the backticks — which silently disables the check for that row.

**Fix:** count criteria, not paths. A `done` row that yields no verifiable evidence should fail with
"AC-7 is marked done and cites nothing checkable", not pass by omission.

---

## R-4 · CRITICAL — the access matrix is the product's evidence, and no gate can fail on what it says

`docs/ACCESS-MATRIX.md` is committed, and its last line reads:

> **⚠ 2 anomalies** — behavior differs from intent. Each is a defect until explained.

Neither is explained anywhere in the repository:

```bash
grep -rn "anomal" --include=*.md . | grep -v node_modules | grep -v docs/review
# docs/ACCESS-MATRIX.md, and nothing else
```

It also publishes a bypass table containing, unanswered:

| Severity | Object                             | What the artifact says                                                                               |
| -------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| CRITICAL | `supabase_etl_admin`               | BYPASSRLS, not a sanctioned bypass role, **client-reachable** — "confirm it, revoke it, or allow it" |
| MEDIUM   | `organization`                     | dual write path: the RPC holds the validation and `authenticated` can skip it and write directly     |
| MEDIUM   | `organization_member`              | same                                                                                                 |
| CRITICAL | `enforce_owner_authority()`        | SECURITY DEFINER, EXECUTE-able by `anon`                                                             |
| CRITICAL | `enforce_organization_has_owner()` | SECURITY DEFINER, EXECUTE-able by `anon`                                                             |

**Nothing in the repository fails on any of it.** Read `scripts/access-matrix.mjs`:

- the prober is invoked with `--no-fail`;
- `render()` counts anomalies, prints the count, and **returns a string** — the count is never
  returned to a caller, never thresholded, never compared to zero;
- `--check` re-renders and compares text. Its only verdict is _stale_ or _up to date_.

So the committed matrix could report a cross-tenant leak in the "different organization" column and
`npm run check` would print `generated: ok — types and access matrix are both current`, provided the
committed copy already contained the leak. **The gate protects the freshness of the evidence and is
indifferent to its content.**

This is the most serious structural finding in the review, because the matrix is not one artifact
among many — `PRODUCT.md` names it as the thing that makes B-2 checkable by a stranger, and
`WEBSITE-AND-DOCS.md` puts it in section two of the landing page.

**Fix, in order:** (1) make a non-zero anomaly count exit non-zero, with an explicit
`--allow-anomalies` escape that names each one and its reason, so an accepted anomaly is a written
decision rather than a silent tick; (2) do the same for CRITICAL bypass rows; (3) answer the five
rows above in `FINDINGS.md`, since three of them look like genuine findings and two are the exact
`with check (true)` affordance problem F-8 already diagnosed once.

The dual-write rows are worth reading closely. The RPC holds every validation — the slug pattern, the
name check, the atomic ownership grant — and `authenticated` still holds direct INSERT/UPDATE/DELETE
grants on both tables. The tool's own advice is correct: revoke the direct DML so the RPC is the
only path, and the denial becomes assertable.

---

## R-5 · HIGH — the matrix's own rows are internally inconsistent, which is the failure F-8 warned about

Reading the committed artifact against its own legend:

- The legend says the service role **"bypasses RLS by design"**. The table then shows service role
  as `·` **denied** for SELECT, UPDATE and DELETE on `organization`, and denied on every column of
  `project`. A BYPASSRLS identity cannot be denied by a policy.
- On `organization_member`, service-role SELECT/UPDATE/DELETE render as `⚠ REACHABLE` — flagged as
  anomalies for doing the thing the legend says they are supposed to do.
- Unauthenticated UPDATE on `organization_member` renders `⚠ REACHABLE`, which if literally true is
  the most severe defect in the schema — and which F-5, in this repository, gives an innocent
  explanation for: **a failing `USING` on UPDATE is a silent no-op**, `UPDATE 0`, no error. A prober
  that reads "no error" as "permitted" will report exactly this.

This reviewer could not run the stack and therefore **cannot say which reading is correct.** That is
the finding. keel's most public artifact currently cannot be interpreted by a careful reader without
access to the author, and F-8 already wrote the rule that applies:

> _A matrix with a false positive in it teaches people to ignore the true ones._

**Fix:** decide what the service-role row is for. If it is a control that proves the bypass exists,
`✓` is the expected value and `⚠` is wrong. If the prober cannot authenticate as service role, the
row is unmeasured and should render `—` rather than a denial it did not observe. Then resolve the
UPDATE column: assert on the data after the write, as F-5 concluded for the intent layer, rather than
on the absence of an error.

Related: `rls-report.json` sits untracked in the repository root, gitignored, holding a _different_
report from an earlier era (three anomalies on `organization`, matching the pre-F-8 schema). It is
harmless and it is also exactly the kind of stale artifact that gets read by a future session looking
for ground truth. Delete it, or write it to a temp path as `access-matrix.mjs` already does.

---

## R-6 · HIGH — the load-bearing acceptance criterion for the whole two-layer design is unbuilt

SPEC-002 names AC-4 itself:

> **AC-4 is the load-bearing one.** … The defect must be **semantic** — a helper whose logic is
> wrong — not **syntactic**.

It is `planned`. `supabase/tests/intent/wrong-helper.mutation.test.sql` does not exist.

```bash
ls supabase/tests/intent/
# 001-tenant-isolation  002-organization-creation  003-membership-invariants  004-schema-guard
```

The argument that the intent layer is not redundant with the generated layer — the argument that
justifies hand-writing adversarial pgTAP at all, the argument F-2 is built on and that the README
leads with — **is reproduced in a research memo and not in the suite.** Nothing in CI would notice if
the generated layer silently became sufficient, or if the intent layer stopped catching what the
generated one misses.

SPEC-002's own instruction covers this: _"If AC-4 ever starts passing trivially, the boundary has
moved and this spec should be re-argued."_ It cannot start passing trivially, because it does not
run.

Three other criteria in the same spec are also open and unglamorous but load-bearing: AC-9 (a failing
proof names table, command, identity and row), AC-10 (the free tier proves the claim with no paid
component present — ADR-009's anti-degradation rule, which is the load-bearing promise of the entire
commercial model), and AC-11.

**Fix:** AC-4 is a day of work and it is the highest-value day available. It converts the README's
strongest paragraph from a story about a spike into a test that runs.

---

## R-7 · HIGH — the meta-gate certifies "this gate can fail" by grepping for the word MUTATION

`scripts/gate-health.test.mts` asserts, for every gate, that it has been shown to fail:

```js
const test = readFileSync(`scripts/${gate.replace('.mjs', '.test.mts')}`, 'utf8');
expect(/MUTATION/.test(test), `${gate}'s tests contain no mutation proof`).toBe(true);
```

A comment reading `// TODO: add a MUTATION proof` satisfies it. So does a doc block that merely uses
the word. The rule that makes every claim in this repository credible — _a gate that has only ever
printed a tick has not been shown to be looking at anything_ — is enforced by a substring search.

This is F-20 for the fourth time, and it is in the most consequential place: **the gate that
certifies every other gate.** The audit does not claim any current mutation proof is fake; they were
read and they are real. The claim is that the mechanism cannot tell.

Two smaller weaknesses in the same file:

- Determinism compares `stdout` and exit status, not `stderr`. Every gate writes its failures to
  `stderr`, so a gate that fails non-deterministically compares equal on the channel that is empty.
- `expect(EXTERNAL.length).toBeLessThanOrEqual(4)` is described as "may only shrink" and the list
  currently holds exactly four. The assertion permits swapping members freely; it only forbids
  growth. To be what it says, it should be an explicit frozen list compared by value.

**Fix:** assert that each gate's test file contains a case that actually runs the gate's exported
rule against a mutated input and expects a non-empty problem list. That is a real check and it is not
much harder — the tests already do it; nothing verifies that they do.

---

## R-8 · HIGH — the service-role boundary does not cover Route Handlers, which is where the outside world arrives

`scripts/check-boundaries.mjs` walks the import graph from every rendered entry point. The entry
points are:

```js
/\/(page|layout|template|default|error|loading|not-found)\.tsx?$/;
```

`route.ts` is not in that list. Neither is a standalone `actions.ts`.

ADR-011 draws the architecture down the middle of this gap: _"Server Actions for the app, **Route
Handlers for the outside world.**"_ So the file type designated to receive unauthenticated external
traffic is the one file type the isolation boundary does not walk. There are no route handlers in the
tree today, which is why the gate is green and why this is a hole rather than a defect.

It will stop being theoretical at three named points on the roadmap: **SPEC-007** (the Stripe webhook
— the canonical legitimate service-role consumer), **SPEC-026** (API keys, whose entire thesis is
that a key must not open a bypass route), and **SPEC-027** (outbound webhooks). Every one of those
lands in `route.ts`.

**Fix:** add `route.ts`/`route.tsx` and any `actions.ts` to the entry set now, while the answer is
still "there are none". Where a route handler legitimately needs the service role — the Stripe
webhook does — the gate should require an explicit, named allowance in one place, which is a review
artifact rather than an exception.

---

## R-9 · MEDIUM — the cache-key rule only sees `function` declarations

```js
/(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)[^{]*\{([\s\S]{0,400}?)['"]use cache['"]/g;
```

This matches function declarations. It does not match:

- `const getProjects = async (orgId) => { 'use cache'; … }` — the arrow form, which is the more
  common style in a Next codebase and the one `eslint-config-next` examples use;
- object and class methods;
- a **file-level** `'use cache'` directive, which caches every export in the module — the file passes
  the `/['"]use cache['"]/` pre-filter, then yields no function matches, then reports no problems.

The rule itself is right and well-argued (F-6: the surviving risk is the escape hatch Next's own
error message recommends). Its implementation currently covers one of the three shapes it needs to.

**Fix:** the correct instrument is the AST, and the repository already knows this — F-20's stated
lesson is _"parse the AST, the parsed workflow, or the import statement."_ TypeScript is already a
dependency; `ts.createSourceFile` costs no new package and ADR-013's refusal of
`dependency-cruiser`/`madge` does not apply.

---

## R-10 · MEDIUM — the import graph is a regex, so three real import forms are invisible

```js
[...source.matchAll(/(?:^|\n)\s*import\s[^'"]*['"]([^'"]+)['"]/g)];
```

Not matched: `export * from './queries'`, `export { x } from './y'`, dynamic `await import('…')`,
and `require(…)`. All four are legal, and a re-export barrel is the ordinary way a `lib/` directory
is organized.

This affects both consumers of the graph — the service-role reachability walk (R-8) and the cycle
detector — and it fails **open**: an unparsed import is a path not walked, reported as clean. A
`lib/queries/index.ts` barrel that re-exports the admin client would be invisible to the gate whose
entire purpose is to find it two hops deep.

**Fix:** same as R-9. One AST pass produces the true import list for both rules.

---

## R-11 · MEDIUM — "trivially TRUE `WITH CHECK`" is a string comparison

```sql
and pg_get_expr(p.polwithcheck, p.polrelid) in ('true','(true)')
```

Caught: `with check (true)`. Not caught: `with check (1=1)`, `with check (true and true)`,
`with check (organization_id is not null)`, `with check (auth.uid() is not null)`.

The last two are the realistic ones. They are what a developer writes when the policy will not
compile and they want to move on, they look like constraints, and they constrain nothing about the
tenant. F-8 established that presence of a `WITH CHECK` is not enough because the real defect has
one — the same argument extends one step further than the gate currently goes.

**Fix:** the strong form of the rule is not "is this expression `true`" but **"does this expression
reference the tenant key"**. Requiring `organization_id` (or the table's own `id`, for the root) to
appear in every write policy's `WITH CHECK` is checkable in the same catalog query, and it is the
property the schema guard actually wants.

---

## R-12 · MEDIUM — the freshness gate's drift rule degrades to silence, and it did so on this machine

`scripts/check-freshness.mjs` fetches current majors from the npm registry. On failure:

```js
} catch {
  /* offline — rule 2 degrades, rule 1 still bites */
}
…
if (!offline && Object.keys(latest).length === 0) {
  console.warn('freshness: registry unreachable — the drift rule is skipped, the stamp rule is not');
}
```

A warning, and the run continues. With fresh stamps and a matching Node major, it exits zero:

```bash
node -e "import('./scripts/check-freshness.mjs').then(m=>{const fs=require('node:fs');
  const stamp=JSON.parse(fs.readFileSync('keel.freshness.json','utf8'));
  const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
  const all={...pkg.dependencies,...pkg.devDependencies}; const declared={};
  for(const n of Object.keys(stamp.pins)) declared[n]=m.majorOf(all[n]);
  console.log(m.evaluateFreshness({stamp,declared,latest:{},today:'2026-09-08',nodeMajor:26}));})"
# { ok: true, failures: [] }
```

The design is deliberate and the reasoning is sound — the stamp rule is the load-bearing one
precisely because it cannot be dodged by unplugging the network. The problem is the **failure mode of
the reasoning**, not the reasoning:

On the review machine, `curl https://registry.npmjs.org/next` returned 200 while Node's `fetch`
failed. The gate reported the registry unreachable on a machine with working access to it. So the
drift rule does not need a hostile actor or an air-gapped runner to disappear — a proxy, a corporate
CA, a DNS quirk, or a runtime whose fetch behaves differently from the shell is enough. And the
warning goes to `stderr` inside a thirteen-step run whose summary prints a green tick.

The trilemma is real: fail hard on unreachable and the gate becomes flaky; warn and it becomes
optional. **The third option is to make the degradation visible where the verdict is read** — carry a
`degraded` state through `summarize()` in `check.mjs` so the summary prints `~ freshness  drift rule
skipped (registry unreachable)` instead of `✓`, and let CI, which does have a network, treat degraded
as failure via a flag. `verify.mjs` already models exactly this distinction with its `ran / local /
asserted / skipped` fidelity report; the gate runner should borrow it.

---

## R-13 · HIGH — no remote exists, so nothing in the workflow has ever been a gate

```bash
git remote -v     # (empty)
```

`DEF-003` records this honestly and states the project's own rule: _"an unrun workflow is a file, not
a working gate."_ It is filed with trigger `decided:remote_created`, which never fires on its own —
the registry's documentation notes that `decided:` is "the one to be suspicious of, because it is
also the easiest place to hide something indefinitely."

What has never executed: `npm ci --ignore-scripts` on a clean runner, the Supabase CLI in CI, the
pgTAP suites, the access-matrix artifact upload, `npm audit`, CodeQL, and `gitleaks` over full
history. `npm run verify` measures its own honesty at 45% and names the six steps it can only assert.

The cost is not hypothetical. The weekly clean-clone build is described in `WEBSITE-AND-DOCS.md` as
landing-page material ("It won't rot"), and B-3's proof is that staleness fails the build. **No build
has ever failed, because no build has ever run.** Every CI claim in the repository is currently a
claim about the contents of a YAML file.

**Fix:** push. It is the single cheapest action in this review with the largest number of downstream
closures, and it converts twelve asserted steps into observed ones in one afternoon.

---

## R-14 · MEDIUM — the claim cannot be checked by the person it is meant to convince

`README.md` offers the matrix as the artifact that lets a stranger check the claim without trusting
anyone. To actually verify it, that stranger needs Node 26, Docker, the Supabase CLI, `psql`, a
Python 3.10+ virtualenv, and a successful `supabase start`.

Observed on the review machine:

```bash
npm run check
#   Missing prerequisites:
#     psql      — the gates query the database directly
#     supabase  — runs the local stack and the pgTAP suite
```

That is **correct behavior** and one of the better details in the repository — `check.mjs` names
every missing prerequisite rather than dying in a stack trace three layers down, and it refuses to
skip database-backed gates, because a green run that proved nothing is the defect F-13 was.

The finding is not about the code. It is that **the proof has a five-tool installation between it and
its audience**, and the audience for "your isolation is probably broken" is a person who has not yet
decided to care. Bar B-2's proof mechanism and bar B-5's stranger-with-only-the-docs are in tension,
and nothing in the spec set currently owns resolving it.

**Fix, and it is a product decision rather than a bug fix:** publish the matrix and the CI run that
produced it as a URL. A stranger should be able to see the "different organization" column and the
green run that generated it from a phone, and only install Docker if they want to reproduce it
themselves. This is the same conclusion `WEBSITE-AND-DOCS.md` section 2 already reaches; the audit's
addition is that **it is not a marketing task, it is the delivery mechanism for B-2**, and it should
be owned by a spec.

---

## Summary

| Finding | Severity | One line                                                                      |
| ------- | -------- | ----------------------------------------------------------------------------- |
| R-1     | CRITICAL | Stale-count gate is digits-only; seven front-page claims are wrong today      |
| R-2     | CRITICAL | "Every night" is unimplemented; the criterion is done, citing a missing file  |
| R-4     | CRITICAL | Nothing fails on the matrix's anomalies or its CRITICAL bypass rows           |
| R-3     | HIGH     | Criteria with prose evidence are skipped silently                             |
| R-5     | HIGH     | The published matrix contradicts its own legend                               |
| R-6     | HIGH     | AC-4, the load-bearing proof of the two-layer design, does not exist          |
| R-7     | HIGH     | "Can this gate fail?" is answered by grepping for a word                      |
| R-8     | HIGH     | Route Handlers are outside the service-role boundary                          |
| R-13    | HIGH     | No remote; no workflow step has ever executed                                 |
| R-9     | MEDIUM   | Cache-key rule misses arrow functions and file-level directives               |
| R-10    | MEDIUM   | Import graph misses re-exports and dynamic imports, failing open              |
| R-11    | MEDIUM   | Trivial `WITH CHECK` detection is a string match                              |
| R-12    | MEDIUM   | Drift rule silently disables itself; observed doing so on a networked machine |
| R-14    | MEDIUM   | Verifying the claim requires five tools the audience has not installed        |

**Nine of the fourteen are in the gate suite rather than in the application**, which is the correct
place for them to be at this stage and the strongest available argument that building the harness
first was the right call: the defects landed where there was something to inspect. The concerning
half is that seven of the nine are the _same_ defect — a check that matches text instead of parsing
structure — a class this repository named, gated against, and then committed four more times.

**That is the recommendation underneath all of them: adopt one rule and enforce it in
`gate-health`.** No gate may make a decision from a regular expression over source text, prose, or
markdown where a parser exists. TypeScript, the YAML parser and `JSON.parse` are already
dependencies; the SQL catalog is already queried directly. The remaining string matches are the
project's largest single source of self-deception, and they are all in the layer whose job is to
prevent it.
