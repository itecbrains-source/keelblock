# Findings

Things keelblock discovered by **measuring**, not by reasoning. Each was reproduced before it was believed,
and each changed the code or a decision. Dated, with the repro, so a reader can check rather than
trust.

This file is the evidence behind keelblock's claim. It is also, deliberately, the most useful thing we can
publish: none of it could be written by someone who had not done the measurement.

---

## F-1 · `anon` could TRUNCATE every tenant table on a default Supabase project

**2026-09-07 · fixed in `20260907130000_revoke_destructive_defaults.sql`**

```sql
set role anon;
truncate public.organization cascade;   -- TRUNCATE TABLE  (cascaded to members and projects)
```

Supabase's default privileges (`pg_default_acl`) grant `Dxtm` — TRUNCATE, REFERENCES, TRIGGER,
MAINTAIN — to `anon` and `authenticated` on tables created by `postgres`. **RLS does not apply to
TRUNCATE at all**, so no policy can prevent it and no policy test — generated or hand-written — can
see it.

**Honestly scoped:** PostgREST exposes no TRUNCATE verb (verified: 404), so this is not a remote
zero-click. It converts any SQL injection in a `SECURITY INVOKER` function, or a leaked role
credential, from a scoped read into total data loss. Every project inheriting Supabase's defaults has
this grant.

## F-2 · The leading generated RLS test suite confirms a total cross-tenant leak as green

**2026-09-07 · shapes SPEC-002's two-layer design**

Planted a semantic defect — the membership helper dropping its `user_id` check, the kind of thing a
bad merge produces:

```sql
-- before: where m.organization_id = org and m.user_id = (select auth.uid())
-- after:  where m.organization_id = org
```

Result: a user who belonged to one organization could read both. The generated suite reported the
affected table **clean**. Its own output explains why:

> _"opaque policy function(s) were MOCKED to prove the policy delegates correctly (wiring) — the
> function's own logic is NOT verified here"_

An exhaustive generated suite verifies that a policy _delegates_ to its helper. Every line inside
that helper is unverified by it. Since the membership predicate is exactly such a helper, a
hand-written intent layer is not a nice-to-have — it is the only thing testing the predicate at all.

**A syntactic defect (`with check (true)`) _is_ caught.** Only the semantic one slips through, which
is why keelblock's proof of this uses a wrong helper rather than a suspicious-looking policy.

## F-3 · `FORCE ROW LEVEL SECURITY` does not stop the table owner on Supabase

**2026-09-07 · SPEC-001 REQ-11**

```
rolname  | rolsuper | rolbypassrls
postgres | f        | t
```

Measured with FORCE enabled: `postgres` read every row across every organization. It bypasses via
`BYPASSRLS`, not via ownership, so FORCE changes nothing — **including the remediation the tooling
itself recommends.**

Consequence: any `SECURITY DEFINER` function owned by `postgres` runs RLS-bypassed. keelblock's membership
helper works _because of_ this. One returning **rows** rather than a scalar would be a total isolation
bypass with no policy involved, invisible to every test layer.

## F-4 · A cross-tenant write is invisible to the attacker

**2026-09-07 · SPEC-001 REQ-4**

With a `WITH CHECK (true)` write policy, a member inserted a row into another organization — and then
still saw only their own row. The smuggled row is invisible to the person who wrote it.

**A suite that proves isolation by reading can never detect this.** Only one that attempts a
cross-tenant write and asserts rejection does. Relatedly: presence of a `WITH CHECK` is not enough —
the real defect _has_ one, it is `true`.

## F-5 · A failing `USING` on `UPDATE` is a silent no-op

**2026-09-07 · shapes every write test in the intent suite**

A member attempting to promote themselves to owner gets `UPDATE 0` — **no error**. Security holds,
silently.

So the privilege-escalation case must be asserted on the _data_. A test expecting an exception fails;
a test merely expecting "no error" passes while proving nothing.

## F-6 · Cache Components break every authenticated page in Next 16

**2026-09-07 · amended ADR-004**

With `cacheComponents: true`, any Server Component reading cookies fails the production build — and
every authenticated Supabase read reads cookies. `<Suspense>` around the read is the fix, and the
route then partially prerenders: static shell, streamed tenant data. **So a standard authenticated
page shell is an architectural default, not a style preference.**

The good news is also measured: Next **refuses** `cookies()` inside `use cache`, so the naive
cross-tenant cache leak is a build error rather than a review responsibility.

## F-7 · `EXECUTE` on a new function defaults to `PUBLIC`

**2026-09-07 · SPEC-001 REQ-11**

On a real stack the membership helper was callable by **`anon`** — an unauthenticated oracle over an
RLS-protected table. A bare Postgres container did not model this; the full Supabase stack did.

_Method note: a spike environment that is nearly the target returns nearly the truth._

## F-8 · An unconstrained INSERT policy made the access matrix cry wolf

**2026-09-07 · fixed in `20260907140000_organization_creation_rpc.sql`**

The generated matrix flagged `organization` as REACHABLE by a different-organization user. It was a
**false positive** — the prober created an organization (permitted by `with check (true)`), became its
owner, and legitimately read its own row.

The diagnosis indicted the schema rather than the tool: `with check (true)` was the only unconstrained
write policy in keelblock, a spam vector, and the exact shape keelblock's own gate forbids. Creation moved to a
`SECURITY DEFINER` RPC, so there is no INSERT policy at all and the matrix reads clean.

**A matrix with a false positive in it teaches people to ignore the true ones.**

---

# Found by auditing our own work

The findings above came from building. These came from **deliberately attacking what we had already
shipped and called green.** Two were live security defects. Three were keelblock breaking its own rules.

That distinction is the point: a green suite means the tests you wrote pass. It says nothing about
the tests you did not think to write.

## F-9 · An admin could demote the owner and seize the organization

**2026-09-07 · fixed in `20260907150000_membership_invariants.sql`**

```sql
-- as an ADMIN of the organization
update public.organization_member set role = 'member'
 where user_id = '<the owner>';         -- UPDATE 1
```

The owner became a member. An admin could take over any organization they administered. The `owner`
role is meaningless if an admin can remove it.

Fixed with a trigger: any row that _is_ an owner, or is _becoming_ one, may only be touched by an
owner.

## F-10 · The last owner could orphan an organization

**2026-09-07 · same fix**

```sql
-- as the ONLY owner
delete from public.organization_member where user_id = '<me>';
-- orgs = 1, members = 0
```

An organization nobody can administer, nobody can delete (delete requires an owner), holding its slug
forever. Fixed with a per-statement invariant that still permits succession — promote a new owner,
then step down — because that is two statements and each intermediate state is legal.

**Neither defect was caught by 23 passing intent tests**, because both were cases the author of those
tests did not consider. This is the argument for auditing a suite against the schema rather than
trusting it.

## F-11 · `auth.uid()` reads two different settings, and tools clear only one

**2026-09-07 · shapes `scripts/check-policies.mjs`**

```sql
select set_config('request.jwt.claim.sub', '<uid>', true);
select set_config('request.jwt.claims', '', true);   -- clears the PLURAL
select auth.uid();                                   -- still returns <uid>
```

`auth.uid()` is `coalesce(request.jwt.claim.sub, (request.jwt.claims)::jsonb->>'sub')`. The policy
prober resets identity by clearing only the plural form, so a stale identity survives — and keelblock's
membership triggers then correctly fire on the prober's own fixture reset, aborting its file.

Consequence: **a table carrying domain-invariant triggers cannot be probed by a policy prober**,
whose model is "policies only" and which cannot distinguish a business-rule refusal from a policy
denial. `organization_member` is therefore covered by the intent layer instead — recorded in
`check-policies.mjs` as an explicit **coverage transfer, never a coverage hole**, naming the tests
that carry it.

## F-12 · A deferred constraint trigger is invisible to a statement-level test

**2026-09-07**

The last-owner invariant was first written `deferrable initially deferred`. It fired at COMMIT, so
`throws_ok` never saw it and the test failed while the protection worked. It was also worse for
users: the error arrived far from the statement that caused it.

`initially immediate` fixes both and still permits succession. **A correct protection that no test
can observe is indistinguishable from an absent one.**

## F-13 · keelblock's own `unit` gate could not fail

**2026-09-07 · the most embarrassing finding here, and the reason it is published**

`npm run check` ran `vitest run --passWithNoTests` against **zero test files**, and reported a green
tick. Meanwhile `render()` — the pure function producing the access matrix, the artifact the whole
claim rests on — had no test at all.

keelblock's own rule is _every gate ships a proof it can fail_. The gate enforcing that rule did not
have one. Fixed: `--passWithNoTests` removed, and nine tests added of which six are mutation proofs
that restore a real defect and assert the matrix goes loud.

**The rule was written down and still violated.** Writing a standard is not implementing it, and the
only reliable check on that is an audit that assumes the author was wrong.

## F-14 · An unconstrained default privilege we also had to un-claim

**2026-09-07 · corrected in the same migration**

The last-owner invariant was originally documented as holding "on every path — including the service
role." That was theater: a service-role holder bypasses RLS and can drop the trigger outright.
Enforcing it unconditionally also broke the policy prober's legitimate fixture reset.

Both triggers now constrain **user-initiated** changes and say so. **An overclaimed guarantee is a
worse defect than an absent one**, because people build on it.

---

# Found by reading the competition

## F-15 · In an app-layer model, the other tenant's row is in memory _before_ the check runs

**2026-09-07 · from `boxyhq/saas-starter-kit`, and the clearest illustration of why keelblock exists**

BoxyHQ is the most-starred free kit in the category — 4,928 stars, Apache-2.0, genuinely well built.
Its tenant isolation works like this:

```ts
// models/apiKey.ts — fetch by id, unscoped
export const getApiKeyById = async (id: string) =>
  prisma.apiKey.findUnique({ where: { id }, select: { id: true, teamId: true } });

// lib/guards/team-apiKey.ts — then compare, in application code
export const throwIfNoAccessToApiKey = async (apiKeyId: string, teamId: string) => {
  const apiKey = await getApiKeyById(apiKeyId);
  if (teamId !== apiKey.teamId) throw new ApiError(403, '…');
};
```

That is disciplined, readable code. It is also **two steps**, and the order is the whole point:

1. the row is fetched — **any tenant's row, by id alone**
2. a _separate function_ the route must remember to call compares the tenant

So a foreign tenant's data is already in the process, in memory, in the log if anything logs the
query, before anything decides you were not allowed to see it. **Under RLS the row is never selected
at all** — the predicate is inside the query plan, and there is no step 2 to forget.

This is not a criticism of their engineering. It is the ceiling of the architecture: `grep -r
"create policy"` across their schema and lib returns **zero matches**, and there is no Prisma
`$extends` or middleware applying scope centrally either, so every one of ~50 query sites carries the
obligation individually. Five thousand stars have accumulated on that arrangement, which is the
market telling you the gap is not obvious to buyers.

**Two smaller observations from the same repository**, both of which keelblock had already decided
differently, and which are worth recording because they were arrived at independently:

- They ship `knip` as `check-unused` — and **their CI does not run it.** The tool exists; nothing
  enforces it. That is the advisory-not-blocking pattern keelblock rejects by design.
- Their CI has **no secret scanning** at all.

## F-16 · A strict CSP, static prerendering, and working hydration — pick two

**2026-09-07 · decided the default in `src/lib/security-headers.ts`**

Shipped a CSP with `script-src 'self'` — no `'unsafe-inline'`, no `'unsafe-eval'` — verified the
seven headers on a real response, and was about to call it stronger than the field's. Then counted
what the server actually returns:

```
inline <script> (no src): 13    external <script src>: 10
```

**`script-src 'self'` blocks all thirteen and the page never hydrates.** A CSP that looks strict and
breaks the application is worse than a weak one, and it would have shipped.

Measuring the alternatives established a genuine trilemma — you can have any two:

| Approach              | Strict  | Prerenders | Hydrates |
| --------------------- | ------- | ---------- | -------- |
| `'unsafe-inline'`     | ✗       | ✓          | ✓        |
| per-request **nonce** | ✓       | **✗**      | ✓        |
| **report-only**       | reports | ✓          | ✓        |

The nonce row is the one worth proving rather than assuming: a nonce in the _response header_ alone
does nothing, because prerendered HTML was fixed at build time and carries no matching attribute. To
use a nonce the HTML must be generated per request — so static prerendering is gone. Verified.

**keelblock's default: the six non-CSP headers enforced unconditionally, and the CSP report-only.** That
is the honest reading of "secure by default" — enforce everything enforceable without breaking the
app, and report the one thing that cannot be, rather than shipping `'unsafe-inline'` and calling it
protection. `KEELBLOCK_SECURITY_HEADERS=on` enforces the CSP for teams who have tuned it.

## F-17 · `NEXT_PUBLIC_` on a credential publishes it, and nothing warns you

**2026-09-07 · `src/lib/env.schema.ts`**

`NEXT_PUBLIC_*` variables are **inlined into the browser bundle by the bundler**. So
`NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` is not a latent risk — it is a service-role key served to
every visitor, and one typo away at all times. No kit examined checks for it.

keelblock refuses at boot any `NEXT_PUBLIC_` variable matching a credential shape (`SERVICE_ROLE`,
`SECRET`, `PRIVATE_KEY`, `_TOKEN`, `PASSWORD`, `_DSN`).

The same file exists because of a bug worth recording, found in a competing kit:

```ts
securityHeadersEnabled: process.env.SECURITY_HEADERS_ENABLED ?? false;
```

Setting that to `"false"` **enables** it — `??` only catches `undefined`, and a non-empty string is
truthy. keelblock parses an enum, so `"false"` is a boot error rather than a silent inversion.

## F-18 · keelblock inherited two-majors-behind rot from `create-next-app`, on day two

**2026-09-07 · found by the freshness gate on its first run**

The gate that exists to stop keelblock becoming a stale starter found keelblock already stale:

```
[drift] typescript: pinned at 5, current is 7 — 2 majors behind (limit 1)
[stamp] knip: package.json has major 6, stamp claims 5
```

`create-next-app` pins `typescript: ^5`. TypeScript 7 is current. **keelblock shipped two majors behind
on its second day, from the scaffold itself**, and without this gate nothing anywhere would have
said so — it builds, it typechecks, the tests pass.

The second line is the gate catching its author: I wrote a stamp claiming knip 5 while installing 6.

**Upgrading found a genuine external blocker.** TypeScript 7 typechecks keelblock cleanly — and about
three times faster, 1.7s → 0.5s, being the Go-based compiler — but `typescript-eslint` refuses to
load against it and ESLint aborts outright. keelblock sits on TypeScript 6: one major behind current,
inside the gate's one-major grace, which is the situation that grace exists for. Registered as
**DEF-008** with the upstream tracking issue.

TypeScript 7 also caught a real weakness TypeScript 5 permitted: a parser returning `{}` with no
index signature, indexed by a string. Two majors of drift had been hiding a type hole.

## F-19 · A gate that misreports its own failure sends you to debug the wrong thing

**2026-09-07 · `scripts/check-schema-guard.mjs`**

The new-table guard's first version printed:

```
schema-guard: could not reach the database. Is the local stack running? `supabase start`
```

The database was running. The query had a SQL syntax error, and the catch block assumed every
failure was connectivity. That message sends a reader to check Docker for twenty minutes.

It now distinguishes the two and says which: _"the query failed — this is a bug in the gate, not in
your schema."_ Being wrong is acceptable; **being confidently wrong about which layer is broken is
not**, and it is a failure of SPEC-002 REQ-8 (a failing proof must be legible).

The same gate had a second, quieter defect: it counted **2** tenant-scoped tables where there are 3.
It looked for an `organization_id` column, and the `organization` table does not reference itself —
so **the root table, the most important one in the schema, was invisible to the guard protecting
it.** Now covered, and pinned by a pgTAP case that disables RLS on the root and asserts it is caught.

## F-20 · The grep-versus-parse trap, three times, by the person who gated against it

**2026-09-07 · a pattern worth naming rather than a defect worth fixing**

Three times in this project, a check matched text that merely _mentioned_ the thing it was looking
for:

1. **SPEC-003 rule 5** was written because a `toContain` over a CI workflow is satisfied by a comment.
   The rule was correct and I wrote it deliberately.
2. **The audit verification script** then reported the `--passWithNoTests` gate as unfixed — matching
   the comment that explains why the flag was removed. Ten minutes after writing rule 5.
3. **The portability test** reported that `check-locale.mjs` imports `next/link` — matching the
   string inside the regex that _detects_ that import. Written while adding a rule about it.

Each was caught by a test, none by review, and the third by a test written in the same commit as the
rule it violated.

**The lesson is not "be careful."** Care demonstrably does not work here — the same person made the
same mistake three times while actively thinking about it. The lesson is structural: **a check that
matches text will eventually match a mention.** Parse the AST, the parsed workflow, or the import
statement — or accept that the check reports its own bugs as the codebase's.

## F-21 · A specific date, from an agency blog, in a spec

**2026-09-07 · corrected in `research/05-SEO-2026.md` and SPEC-028 REQ-2**

The SEO memo asserted: _"FAQ rich results were removed on 7 May 2026."_ Precise, plausible, and
sourced from a content-marketing post. Google's own Search Central blog says something materially
different:

> _HowTo_ rich results are **deprecated** — no longer shown, documentation removed. _FAQ_ rich
> results **"will only be shown for well-known, authoritative government and health websites"** —
> restricted, not removed. And: _"there's no need to proactively remove it. Structured data that's
> not being used does not cause problems for Search, but also has no visible effects."_

**The date could not be verified against any primary source.** It had already reached a requirement.

The failure was not carelessness — the memo cited nine sources and looked diligent. It was that
**nothing asked which tier a source was.** A specific date lends more authority than a vague claim,
so an unverifiable specific is more dangerous than an obvious guess.

Two mechanisms came out of it: a **pinned corpus** (`research/corpus.json`) recording every
authoritative source with the date it was read and the specific claim it supports, and a gate rule
that **refuses a memo which has not separated primary from secondary**. A gate cannot judge
authority — but it can refuse a memo that never asked the question, and that refusal is what sends
the author to find the vendor's own documentation.

## F-22 · Two records of one fact, disagreeing — and the gate that hid it

**2026-09-07 · `scripts/check-contracts.mjs`**

SPEC-001 and SPEC-003 read **`done` in the spec index** and **`draft` in their own file headers**,
for several commits. SPEC-002 read `partial` and `draft`.

The new evidence rule — _a shipped spec's acceptance criteria must cite files that exist_ — passed
cleanly, because it only inspects shipped specs and every spec file claimed to be a draft. **The
drift concealed the check that would have caught the drift.**

When status agreement was enforced and the specs corrected, the evidence rule immediately found what
it had been hiding: fourteen acceptance criteria in SPEC-001 alone citing files that were never
written under those names, because the spec was authored before the implementation and never
reconciled.

Two refinements followed, both from being wrong once:

- **Evidence is checked per criterion, not per spec.** A `partial` spec legitimately has `planned`
  criteria whose files do not exist. Demanding them would train people to ignore the gate, which is
  worse than not having it.
- **A glob is not evidence.** `supabase/tests/intent/*.test.sql` cannot be verified, so it is refused
  outright rather than passed as approximately true.

## F-23 · Documentation that asserts a count is documentation that will lie

**2026-09-08 · `scripts/status.mjs`**

The most expensive failure in a long-running project is not a bug — it is a session reading a status
document, believing it, and rebuilding something that shipped weeks ago. Every hand-maintained status
page becomes that document, because nothing updates it when reality moves.

The rule that follows: **durable claims are written down; volatile state is computed.** A decision, a
measurement, a rejected option — durable, and they belong in a file. A count, a status, a
"what's left" — volatile, and asking a file for them is how a project starts lying to itself.

So `npm run status` reads the repository, and `--check` verifies that **no document asserts a
countable fact that has gone stale.** On its first run it found one — in `AGENTS.md`, written by me,
claiming `twelve gates` where there were eleven. The fix was not to correct the number. It was to stop
asserting it and point at the command.

**It also exposed the closure failure this mechanism exists for.** `SPEC-001` read `done` with **2 of
14** acceptance criteria still marked `planned`; `SPEC-003` read `done` with **0 of 9**. Both were
genuinely complete — the work shipped, the header was updated, and the table was never reconciled.
A reader cannot distinguish that from a reader being misled. There is now a closure rule: a spec
claiming `done` with an open criterion fails the build.

## F-24 · A test that touches shared state is the flake that disables the suite

**2026-09-08 · `scripts/gate-health.test.mts`**

The meta-gate asserts every gate is deterministic — and did it by spawning **every** gate twice,
including those that query the database. Inside a full `check` run it failed once and then passed on
every retry.

That is the worst possible failure mode for a gate suite. A flaky suite is a disabled suite, and the
discipline goes with it. The cause was that a _unit_ test had been coupled to state it does not own.

Determinism is now asserted over gates that read only the working tree. The four that reach the
network or the database are excluded **with the reason stated**, because their determinism is a
property of that external state rather than of the gate — and it is checked where it belongs, by
`check` running them against the real thing.

The exclusion list is pinned and may only shrink. _An exclusion list is where a determinism guarantee
goes to die._

## F-25 · Two tracked deferrals were silently deleted, and every gate said "ok"

**2026-09-08 · `scripts/check-deferrals.mjs`**

Repairing one malformed row in the deferral registry, a script spliced from the index of `DEF-005` to
the index of `DEF-004` — and removed everything in between. **DEF-006 (auth hardening) and DEF-008
(the TypeScript 7 blocker) were deleted.**

The gate then reported `deferrals: ok — 5 open, no trigger fired, no orphan markers`, and it was
narrowly telling the truth. Every rule it had was satisfied: the surviving rows had reasons, valid
triggers, no orphan markers. **Nothing checked that rows still existed**, because nothing else in the
repository references a deferral by id, so a deleted one leaves no trace anywhere.

Two things followed:

**Recovered from git history, not rewritten.** Rewriting from memory would have produced rows that
looked identical and quietly said something different — the TypeScript reason in particular was a
precise external blocker with an upstream issue number, and an approximation of it is worse than
useless, because it reads as a record.

**Ids are now checked for contiguity.** They are never reused, so a gap means a deletion. The message
says to recover it from git rather than rewrite it, because that is the mistake available at exactly
that moment.

The general shape is worth keeping: **a register whose entries nothing else references cannot detect
its own losses.** Every such register needs a completeness check that is independent of its contents —
here, the sequence itself.

## F-26 · The gate protecting the evidence was indifferent to what the evidence said

**2026-09-08 · `scripts/access-matrix.mjs`**

`docs/ACCESS-MATRIX.md` is the artifact the central claim rests on — the thing `PRODUCT.md` offers as
what makes B-2 checkable by a stranger. It was generated, committed, and guarded by `--check`, which
re-renders it and fails if the committed copy is stale.

**That is a check on the document, not on the database.** `render()` counted anomalies in a local
variable, printed the count into the markdown, and returned a string. The number never reached a
caller. It was never compared to zero, and the prober was invoked with `--no-fail`.

So the committed matrix could have reported a cross-tenant read in the "different organization"
column and `npm run check` would have printed `generated: ok`, provided the committed copy already
contained it. The only thing that could go red was disagreement between the file and the renderer.

It was not hypothetical. The committed copy carried, unanswered:

```bash
grep -n "⚠" docs/ACCESS-MATRIX.md
#   **⚠ 2 anomalies** — behavior differs from intent. Each is a defect until explained.
grep -rn "anomal" --include=*.md . | grep -v node_modules
#   docs/ACCESS-MATRIX.md, and nothing else
```

Two anomalies and three rows the tool itself labelled CRITICAL, published for weeks, explained
nowhere, and incapable of failing anything.

**The fix is not a threshold.** A count that must be zero would have been silenced the first time
something legitimate appeared — and something legitimate did: five of the eight concerns are the
tenancy model working as designed. What the artifact needed was **adjudication**: every concern must
be absent or answered, an answer is a written reason in `keelblock.access-allowances.json`, and the
reason is **published in the matrix itself**, so the person the document exists for can read the
argument instead of taking it on trust.

Three details carry the weight, and each is a mutation proof:

- **A reason under 24 characters is refused.** Otherwise `"ok"` retires a cross-tenant leak, and the
  mechanism becomes a switch with extra steps.
- **An allowance matching nothing fails.** A stale entry is a check already silenced for whatever
  reoccupies its key later.
- **`render()` and `evaluate()` share one anomaly predicate.** The recurring defect in this
  repository is one question answered by two resolvers that drift; building the second one here would
  have meant the published count and the enforced count could disagree.

The general shape: **freshness and content are different properties, and a generated artifact needs
both.** Guarding only freshness proves the document keeps up with the database. It says nothing about
whether what the database is doing is acceptable, which is the only reason anyone reads it.

## F-27 · Both anomalies were false positives, and "REACHABLE" was doing work the data could not support

**2026-09-08 · adjudicated in `keelblock.access-allowances.json`**

With F-26's rule in place, the two anomalies had to be answered. Neither is a defect.

```sql
-- as anon, against the live local stack
set role anon;  update public.organization_member set role='owner';
-- ERROR:  permission denied for table organization_member
set role service_role;  select count(*) from public.organization_member;
-- ERROR:  permission denied for table organization_member
```

Both cells are denied **at the privilege layer, before RLS is consulted**. `anon` holds no grant on
that table at all; `service_role` holds `REFERENCES, TRIGGER, TRUNCATE` and no DML (see F-28).

So why did the matrix say `⚠ REACHABLE`? Two mechanisms, and the second is the more interesting.

**The prober infers identity and expectation by matching words in a test's description.** In
`rlsautotest/report.py`, the fallback classifier reads the pgTAP label: a label containing `"anon"`
is the anon identity, and the expectation is derived from whether the wording contains `"denied"`,
`"blocked"`, `"row(s)"`, `"can"`. That is the same grep-versus-parse trap as F-20, in a third-party
tool, deciding what our flagship artifact says.

**And `render()` promoted a failed assertion to a claim about the database.** The report records
`pass: false` — _this assertion did not pass_. It does not record why. The renderer mapped
`pass:false, exp:false` to the word **REACHABLE**, which asserts that a tenant boundary is open. A
test can fail because data leaked; it can also fail because the statement errored, which is what
happened here.

The word was deliberately **not** softened. For a genuine leak, `REACHABLE` is exactly right, and
weakening it to make two false positives read better would blunt the only signal that matters. The
answer is adjudication: the cells stay loud, and the artifact now carries the reason each was
dismissed, with the reproduction. F-8 already wrote the rule this serves — _a matrix with a false
positive in it teaches people to ignore the true ones_ — and the way to honor it is to explain the
false ones in public, not to hide them.

Also dismissed, with the same treatment: `supabase_etl_admin`, flagged CRITICAL as a
"client-reachable" bypass role. It is a Supabase platform role, no role is a member of it, and
`set role anon; set role supabase_etl_admin` fails with `permission denied to set role`. The tool's
own sanctioned list names five platform roles and predates this one.

## F-28 · A role that can destroy a table it cannot read

**2026-09-08 · fixed in `20260908120000_close_execute_and_truncate_gaps.sql`**

F-1 found `anon` holding TRUNCATE on every tenant table through Supabase's default ACLs, and
`20260907130000` revoked it. **From `anon` and `authenticated`.** `service_role` was not in the
statement.

Measured on the live stack, before the fix:

```sql
select table_name, string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema='public' and grantee='service_role'
group by table_name;
--  organization         REFERENCES,TRIGGER,TRUNCATE
--  organization_member  REFERENCES,TRIGGER,TRUNCATE
--  project              REFERENCES,TRIGGER,TRUNCATE
```

No `SELECT`, no `INSERT`, no `UPDATE`, no `DELETE`, and `TRUNCATE` on all three — so the sanctioned
bypass role could destroy every tenant's rows and could not read one of them. RLS does not apply to
TRUNCATE at all, so no policy in this repository limits it.

Stated honestly, because the severity matters: `service_role` is server-only and never reaches a
browser, so this is not remotely exploitable. It is **blast radius**. A leaked service key currently
meant total data loss rather than a scoped read, which is the wrong way round, and the grant bought
nothing because nothing holds the DML that would make the role useful.

Two things came out of it.

**The same statement missed the same class twice.** `20260907150000` added two SECURITY DEFINER
trigger functions and kept Postgres's default EXECUTE-to-PUBLIC, three migrations after REQ-11 wrote
down that exact rule and applied it to the helper functions. Neither omission was visible to any
gate. A hardening rule applied to the objects that existed when it was written is a rule that decays
silently; the `alter default privileges` half is what makes it stick, and it now covers all three
roles.

**Nothing can currently use the admin client.** `service_role` holds no DML on any tenant table, so
the first thing to wire `src/lib/supabase/server-only/admin.ts` — the Stripe webhook in SPEC-007 is
the canonical candidate — will fail with `permission denied for table`. That is arguably the correct
default (grant it when something needs it, deliberately, rather than in advance), and it is recorded
here so it is discovered by reading rather than by debugging.

## F-29 · The committed database types could not be regenerated from the repository

**2026-09-08 · `src/lib/db/database.types.ts`**

Renaming the project changed the local stack's name, so the old containers were replaced and a new
stack was built from the repository's own migrations. `npm run generate` then produced a file 147
lines shorter than the committed one.

The removed lines were **pgTAP's internal views** — `pg_all_foreign_keys` and `tap_funky` — typed as
part of the application's `Database` schema.

They are there because the committed artifact was generated on a stack where pgTAP had been installed
persistently into `public`. On a stack created from this repository alone they do not exist, and
`supabase test db` does not leave them behind:

```bash
psql -Atc "select extname from pg_extension where extname='pgtap'"   # (nothing)
node scripts/check-policies.mjs                                       # Files=7, Tests=60, Result: PASS
psql -Atc "select extname from pg_extension where extname='pgtap'"   # (still nothing)
```

So the generated file recorded **a property of one machine**, not a property of the schema. The
consequence lands on exactly the person keelblock is trying to convince: a stranger clones the
repository, runs `supabase start`, runs `npm run check`, and is told a committed generated artifact
is stale — through nothing they did, with no way to tell a real schema drift from this.

Two things worth keeping.

**A "generated" artifact is only evidence if it is reproducible from the inputs in the repository.**
Otherwise it is a snapshot of an environment, and the gate guarding it enforces agreement with that
environment rather than with the schema.

**Test frameworks that install into `public` leak into everything that reads `public`.** The
extension is transient here, which is why this went unnoticed; it only had to be resident once, on
the machine that happened to run `npm run generate`.

**Corrected 2026-09-08, by CI.** "Transient here" was true of CLI 2.109.0 and false of the `latest`
a GitHub runner installs, where `supabase test db` leaves pgTAP resident. Since `check-generated`
runs immediately after `check-policies`, the types it read on the runner contained pgTAP's views and
the committed artifact was reported STALE — twice, with a message naming the schema rather than the
cause. Measured: 149 lines of difference between types generated with and without the extension
present. `check-policies` now drops it after the run, which restores the state the gate started in.
The wider lesson survives the correction and is sharper for it: **a gate that leaves residue behind
is a gate that changes what the next one sees**, and the failure surfaces somewhere it cannot be
explained.

Found because a rename forced a clean rebuild. Nothing else would have caught it — the gate compares
the committed file to whatever the current stack produces, so on the machine that produced it, it
agreed with itself indefinitely.

## F-30 · The check that certifies every other check was a substring search

**2026-09-08 · `scripts/gate-health.test.mts`, rule extracted to `scripts/gate-health.mjs`**

Every gate in this repository ships a mutation proof — a test that restores the real defect and
asserts the gate goes red. That rule is what makes a green run evidence rather than agreement, and
`gate-health.test.mts` is what enforced it, for every gate, like this:

```js
const test = readFileSync(`scripts/${gate.replace('.mjs', '.test.mts')}`, 'utf8');
expect(/MUTATION/.test(test)).toBe(true);
```

A comment reading `// TODO: add a MUTATION proof` satisfies that. So does a doc block that happens to
use the word. **The mechanism that certifies every other mechanism could not tell the difference
between a proof and a mention of one.**

This is F-20 — _a check that matches text will eventually match the wrong text_ — for the fourth
time, in the place where it costs most.

Worth stating plainly: **every current mutation proof is real.** They were read, and then parsed. The
defect was never that a gate was faking it; it was that nothing could have told us if one were.

It now asks the question structurally, through the TypeScript AST: is there a test case **named** as
a mutation proof whose body **calls something the gate exports**? A comment cannot satisfy that, and
neither can the realistic decay — a rule gets renamed or inlined, the case keeps its name, and
nothing notices it stopped exercising anything.

The new rule carries three mutation proofs of its own, which is the only defensible way to ship it:
a comment mentioning the word is rejected, a case named as a proof that calls nothing is rejected
with a reason naming what it should have called, and a test file that imports nothing from its gate
is rejected outright.

Two smaller holes in the same file, found while there:

- **Determinism compared `stdout` and exit status, not `stderr`.** Every gate writes its failures to
  stderr, so the comparison covered the channel that is empty exactly when a gate has something to
  say. A gate that reported different problems on identical input would have compared equal.
- **The exclusion list was capped, not frozen.** `expect(EXTERNAL.length).toBeLessThanOrEqual(4)`
  described itself as "may only shrink" and did not mean it: at exactly four entries it permits
  swapping any member for any other, which is how a gate leaves the determinism guarantee without
  the list ever growing. It is now compared by value.

The general shape, and it is the one worth keeping from this whole pass: **a rule about evidence must
be enforced by something that reads structure.** TypeScript, the YAML parser and `JSON.parse` are
already dependencies here; the remaining string matches are this project's largest single source of
self-deception, and they are all in the layer whose job is to prevent it.

## F-31 · A guarantee inherited from a platform default is a coincidence with good uptime

**2026-09-08 · fixed in `20260908140000_revoke_anon_table_access.sql`**

The first CI run this project has ever had failed, and it failed on something no local run could have
caught.

```
# Failed test 10: "ANON: tenant tables are refused at the grant layer, before RLS is consulted"
#       caught: no exception
#       wanted: 42501
```

That assertion had been green on every local run since it was written. The difference is one number:

```bash
docker inspect supabase_db_keelblock --format '{{.Config.Image}}'
#   public.ecr.aws/supabase/postgres:17.6.1.140      -- anon holds NO privilege on public tables
grep -o 'supabase/postgres:[0-9.]*' ci.log
#   supabase/postgres:17.6.1.167                     -- Supabase's default ACL grants anon DML again
```

**The severity, stated carefully, because it is not "a leak".** Row-level security still held on the
newer image: every policy on these tables is `to authenticated`, so an `anon` SELECT returns zero
rows and an `anon` INSERT is refused `42501` by the policy. What disappeared is the layer _before_
that one — the privilege check — and with it the property this repository actually claims: that an
unauthenticated role cannot reach a tenant table at all, whatever any policy happens to say. Defense
in depth is exactly the thing you cannot notice losing.

Two things follow, and the second is the one that generalizes.

**The fix is to write the property down.** `revoke all ... from anon`, plus `alter default
privileges` so a table added later cannot silently re-acquire it. Note that F-1's fix —
`20260907130000`, which revoked TRUNCATE explicitly — **survived the image change intact**, because
it was stated rather than inherited. The same repository, the same class of protection, two
outcomes, and the only difference is whether someone wrote it down.

**It could only have been found by running somewhere else.** `npm run check` was green locally at
every commit — every gate, and the whole pgTAP suite — on an image that happened to be generous. The review's third killer risk was _"nothing has ever run"_, and its recommendation was to
push and watch — with the note that there would be something, because nothing had ever executed.
There was, on the first attempt, in the central claim.

The same run found the smaller sibling: `20260908120000` revoked EXECUTE on the two SECURITY DEFINER
trigger functions **from PUBLIC**, which removed `anon`'s access on 17.6.1.140 and did not on
17.6.1.167, where it arrives by another route. Both were reported there as CRITICAL bypass surfaces
and neither here. Naming the roles is one word longer and portable.

The rule worth keeping: **if a security property is true because of a default you did not set, it is
not a property, it is a version of somebody else's image.**

## F-32 · The documentation was falsified by the commit that made it stale

**2026-09-08 · `scripts/status.mjs`**

Pushing to a remote for the first time made this sentence in `README.md` false:

> `There is no remote yet, so the workflow has never executed on GitHub.`

It was true when written, and false for the duration of the `git push` that created the remote and
ran the workflow — written by the same person who pushed. Two paragraphs above it, the same file
says: _"This README describes what exists today, not what is planned. If that distinction ever
blurs, the project has failed its own first rule."_

**The stale-count gate could not see it, and correctly so.** F-23's rule watches counts, and a count
goes stale when reality drifts past it — slowly, over commits, which is why a periodic check catches
it. **A state claim goes stale instantly**, in the same commit as the action, and there is no drift
window in which anyone would notice.

Two fixes, and the second is the one that generalizes.

**Stop asserting volatile state in prose.** The paragraph is gone, replaced by a CI badge, which is
computed by the thing it describes and cannot lie about it. That is `npm run status`'s rule —
_durable claims written down, volatile state computed_ — applied to a file that was exempt from it
because nobody had thought of the README as making claims.

**And a rule for the class**, because the next one will not be about a remote. `checkStateClaims`
carries one entry today, added because one failure was measured, and it is proven by restoring the
real sentence to the real file and watching the gate go red. The pattern to keep is narrow: a claim
about state is checkable only when the state is observable to the repository, and `git remote` is.
A claim like "nobody uses this yet" is not checkable and does not belong in a gate — it belongs in a
sentence nobody wrote.

The rule caught this finding while it was being written — the paragraph above quotes the false
sentence, and the quotation had to be marked as one, which is the same escape the count rule needed
for the same reason. A rule you cannot state inside the repository it governs will be stated wrongly.

The uncomfortable part is worth stating plainly. Every gate in this repository was written after
someone here got something wrong, and this one is no exception: the defect was introduced by the
change that closed R-13, in the file the review had already found wrong in seven places, on the same
day. **A project whose thesis is "documentation drifts from reality" should expect to keep proving
its own thesis.**

## F-33 · A claim that was true, and a verification that could not have known

**2026-09-08 · `supabase/tests/intent/002-organization-creation.test.sql`**

An external re-score narrowed an open discrepancy to two branches and pointed out that nothing in the
repository could tell them apart.

The access matrix reports `organization` as a dual write path — _"a SECURITY DEFINER rpc writes this
table AND authenticated holds a direct INSERT/UPDATE/DELETE grant on it"_ — and the adjudication for
that row claims the INSERT half was revoked. Either the tool's sentence is a static template, or the
grant is still held and the adjudication is false. The CI run had already removed the innocent third
explanation: the `generated` gate passed, so the committed matrix was current.

```sql
select has_table_privilege('authenticated', 'public.organization', 'INSERT');  -- false
```

**The claim was true.** The grant is gone, `create_organization()` is the only writer, and the tool's
sentence is a template that names all three commands whether or not they are held.

**The verification was blind, and that is the finding.** The migration cited this, from the intent
suite, as its evidence:

```sql
select throws_ok($$insert into public.organization ...$$, '42501', null, '...');
```

`42501` is `insufficient_privilege`, and Postgres returns it for **both** `permission denied for
table` and `new row violates row-level security policy`. So that assertion passes whether the refusal
comes from the grant layer or the policy layer — it cannot say which one is doing the work, which is
the only thing the migration claimed. Worse, the migration's own comment presented the overlap as
what made the change _safe_: "42501, which covers BOTH". It is what made the check unable to see.

Being right by accident is not the same as being right, and a repository whose product is proof
should not need that said.

Now: 002 asserts `has_table_privilege` directly, pins the refusal **message** rather than the code,
and carries a policy refusal beside it as a contrast — same SQLSTATE, different layer, different
message. Restoring the grant turns both red, which was checked by restoring it.

The general shape, and it is the R2 weak-acceptance-criterion rule with a real instance attached:
**a test that passes under both branches of the question it was cited to answer is not evidence for
either.** The tell is available in advance and was written down in this case — an assertion that
deliberately matches a broad code, with a comment explaining how conveniently broad it is.

## F-34 · The auth cookie that arrives with headers nothing can apply

**2026-09-08 · measured against the local stack while building SPEC-004**

`@supabase/ssr` passes `setAll` a second argument — the cache headers that must travel with any
response setting an auth cookie, because otherwise "one user's session token can be served to a
different user". `src/lib/supabase/server.ts` declared `setAll: (list) => …`. One parameter. The
headers were not ignored; they were never received.

The fix looked obvious: take both, and throw if headers arrive somewhere that cannot apply them.
**That would have broken sign-in**, and only measuring showed it. Driving `signInWithOtp` through a
real client against the local stack:

```
setAll #1  sb-…-code-verifier   headers: Cache-Control, Expires, Pragma
setAll #2  sb-…-code-verifier   headers: (none)
setAll #3  sb-…-code-verifier   headers: (none)
```

Three writes, and only the **first** carries headers — confirming the library's own note that they
are "delivered only with the first cookie write". The first cookie is the PKCE code verifier, set
from a Server Action. So a Server Action legitimately writes an auth cookie, legitimately receives
cache headers, and has **no response object to put them on**. Refusing the write would have left the
callback with nothing to exchange.

Two things follow.

**The context decides, not the call.** A Server Action answers a POST, which no CDN caches, so the
headers are genuinely inapplicable rather than dropped — while the same library call on a **GET**
(the proxy, the auth callback) is the real hazard, and those paths use a response-bound client that
applies both halves. The rule in the gate is deny-by-default with one exemption, and the exemption
carries this measurement as its reason rather than a claim that it is fine.

**"Take both arguments" is not the property.** The property is that a response which sets an auth
cookie is not cacheable, and the parameter is one way to fail it. So the gate refuses a `setAll`
that declares the second parameter and never reads it as well — a correct signature is not the
point, and a rule that only counted parameters would pass the version of this defect that keeps
them.

## F-35 · The property was written down, pinned by a test, and not in effect

**2026-09-08 · found by smoke-testing SPEC-004 rather than by any gate**

SPEC-004 REQ-6 states the auth configuration rather than inheriting it — F-31's rule applied to the
place it bites hardest. Sessions gained a `timebox` and an `inactivity_timeout` where Supabase leaves
both unset, and the password floor moved from 6 to 8, the value the generated file's own comment
recommends. A test pins every value, including the ones nobody proposed to change.

All of that was true of the FILE. None of it was true of the running project:

```
docker inspect supabase_auth_keelblock --format '{{.State.StartedAt}}'
#   2026-09-08T03:33:15Z          -- the auth container
stat -f %Sm supabase/config.toml
#   11:29                          -- eight hours later
```

The container predates the change, so the stack was still enforcing a floor of 6 while a green suite
asserted 8. **The gate proved the declaration; the property was not in effect.** That is F-31 one
level up: there, a security property was true because of a default nobody set; here, one was written
down and never applied, which reads identically from inside the repository.

Confirmed both ways after restarting the stack — a 7-character password is now refused
`weak_password: "Password should be at least 8 characters"`, and 8 is accepted.

**The blast radius is smaller than it first looks, and worth stating precisely rather than
alarmingly.** CI runs `supabase start` on a fresh checkout every time, so there the file and the
running project agree by construction. The drift is local, and it affects the developer who edits
config and keeps a long-running stack — which is everyone, eventually.

Two things follow.

**The test now says what it proves.** It verifies the declaration, and its doc comment carries the
one-line curl that settles whether the value is live. A test whose scope is misread is worse than a
missing one, because the misreading is confident.

**Proving it against a DEPLOYED project needs a project.** That is not a gap anyone can close by
writing more machinery here: SPEC-004 AC-10 already defers the `[remotes]` block to DEF-001 because
keelblock has no environments of its own. The honest position is that the declaration is checked,
the local application is one command away, and the deployed application is checkable the day there is
something to deploy to.

## F-36 · The session cookie had no `Secure`, and the obvious fix breaks sign-in locally

**2026-09-08 · fixed in `src/lib/supabase/public-config.ts`**

`@supabase/ssr` ships `DEFAULT_COOKIE_OPTIONS`:

```js
{ path: '/', sameSite: 'lax', httpOnly: false, maxAge: 400 * 24 * 60 * 60 }
```

`secure` is not in it at all. So over HTTPS in production the session cookie would be set without
it, and the browser would also send that cookie over plain http to the same host. Inherited from a
library default rather than a platform one, which makes it the third instance of F-31's rule in a
single day.

`httpOnly: false` is deliberate on their part and is NOT overridden here — `createBrowserClient`
reads the session from these cookies, so making them server-only breaks client-side auth outright.
The consequence is stated in the code rather than left to be discovered: an XSS on this origin can
read the session token, and the mitigation is the CSP, not the cookie.

**The obvious fix is a trap.** `secure: process.env.NODE_ENV === 'production'` is the version
everyone writes, and `next start` sets `NODE_ENV=production` — so a locally served http build would
set `Secure`, the browser would silently drop every auth cookie, and sign-in would present as doing
nothing, with no error in any log. `secure` is therefore derived from the request's own protocol
(`x-forwarded-proto`, then the request URL), which is exact and needs no configuration.

Measured after the change, both directions:

```
http (local)                      Secure present: false   sign-in still works: true
x-forwarded-proto: https          Secure present: true
```

## F-37 · The rename reached the documentation and not the build

**2026-09-08 · `src/app/[locale]/orgs/route-protection.test.mts`**

Next.js 16 renamed `middleware` to `proxy`, and its documentation — version 16.3.4, the exact version
this repository pins — names the matcher-testing helper `unstable_doesProxyMatch`. The installed
package exports `unstable_doesMiddlewareMatch`. There is no `unstable_doesProxyMatch` in the build.

Small, and worth a finding for one reason: the documentation was read first and believed, and the
test failed with `unstable_doesProxyMatch is not a function` — which is a clear error. The version of
this that costs a day is the one where a docs-ahead-of-build discrepancy produces something subtler
than a missing function.

The rule it earns is the one this repository already applies to research memos: **the installed
package is the primary source about itself.** Documentation describes an intent; `node_modules`
describes what will run.

## F-38 · Under Cache Components a route cannot refuse with a redirect

**2026-09-08 · measured while building SPEC-005**

`/orgs` requires a session. The obvious implementation — call the Data Access Layer, `redirect()` if
there is nobody — does not produce an HTTP redirect. It produces `200` and the page chrome.

With `cacheComponents: true` (ADR-004) the route's static shell is prerendered at build time, with no
session, and flushed before any session-dependent code runs. A `redirect()` in the streamed region
becomes a client-side navigation, and the status is already sent. Four approaches, measured:

| Attempt                                      | Result                                                               |
| -------------------------------------------- | -------------------------------------------------------------------- |
| Auth check at the top of the page            | `200`, full chrome                                                   |
| Auth check inside `<Suspense>` with the data | `200`, full chrome                                                   |
| `export const dynamic = 'force-dynamic'`     | **Build error** — "not compatible with `nextConfig.cacheComponents`" |
| `await connection()`                         | `200`, full chrome                                                   |

**What is true, stated as narrowly as the evidence allows.** No tenant data reaches an
unauthenticated caller: zero organization names, zero member rows, zero identifiers — verified
against the running application with two real accounts. What a stranger receives is labels, an
untranslated `Members of {org}` placeholder, and a client-side redirect to sign in.

That is a weaker property than "the route refuses", and the spec now says the weaker one. The
original wording was written before it was measured, which is the whole reason SPEC-005's Definition
of Done demanded a browser walk rather than a green suite.

Two things follow.

**A unit test cannot see this.** `route-protection.test.mts` asserts that the page calls
`getCurrentUser` and redirects when there is no session, and it passes — correctly. The behaviour it
describes is real; the HTTP consequence is not what anyone would assume from reading it. This is the
class the journey layer (DEF-002) exists for, and the strongest argument yet for building it.

**It is a property of the rendering model, not of this application.** Any Next.js project with Cache
Components enabled and a `redirect()`-based auth check has it, and none of them will notice, because
the page looks empty and the browser does navigate to the sign-in screen. The visible symptom is
indistinguishable from working.

## F-39 · A refusal reported as a success, for the whole life of the feature

**2026-09-08 · found by the journey layer on its first real run · fixed in `src/app/[locale]/login/actions.ts`**

Requesting a sign-in link twice in quick succession returns `429` — _"For security purposes, you can
only request this after 0 seconds."_ The action ignored it:

```ts
await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } });
return sent; // ← whatever happened
```

So the person was told **"a sign-in link is on its way"**, no email was sent, and nothing was
recorded anywhere. They wait, nothing arrives, they try again, and the throttle refuses again.

The swallow was deliberate and the reasoning was half right. Sign-in is an account-enumeration
surface, so the same answer must come back whether or not an account exists. **That requires hiding
whether an ACCOUNT EXISTS. It does not require hiding that the provider refused**, and conflating the
two produced a screen that lies.

A throttle is safe to surface: it is keyed on the address the person just typed, so telling them to
wait discloses nothing they did not supply. Anything else stays generic to the caller and is now
logged for the operator — silence there is how a misconfigured mail provider looks exactly like a
working one.

**Three green layers did not see it**, and could not have. The unit tests mock the client, so the
error never exists. The intent and generated layers never reach the application. It took a browser
walking the real form, and it was the first thing that walk found.

Worth stating plainly because it is the argument for the layer: this defect shipped inside SPEC-004,
which had twelve acceptance criteria, a verified end-to-end magic-link round trip recorded in the
spec, and a manual smoke test of ten auth paths. Every one of those exercised the HAPPY path once.
Nobody asks for a second link while testing.

## F-40 · A boolean helper that returned NULL, safe in a policy and unsafe in an `if`

**2026-09-08 · found by SPEC-006's acceptance test, before the function it tested existed · fixed in `supabase/migrations/20260908170000_null_safe_is_org_admin.sql`**

Measured on a clean stack, for a caller who belongs to no organization:

```
is_org_member  -> false
is_org_admin   -> NULL
```

Two sibling helpers, the same name shape, different answers to the same question. `is_org_member` is
built on `exists`, which is never null. `is_org_admin` was:

```sql
select public.org_role_of(org) in ('owner', 'admin');
```

and `org_role_of` returns NULL for a non-member, so the whole expression is NULL.

**Nothing caught it, and the two reasons are the interesting part.** In a policy `USING` clause
Postgres treats NULL as a refusal, so every policy in the schema behaved correctly and no isolation
test could have seen it — the helper was, in the place it was used, right. And the generated prober
_mocks_ these helpers to `select true` / `select false` in order to isolate the wiring, so it proves
a policy consults the helper and by construction can never observe what the real one returns.

It surfaces the first time the helper is used in procedural code, which SPEC-006 was:

```sql
if not public.is_org_admin(org) then
  raise insufficient_privilege using message = 'not an administrator of this organization';
end if;
```

`not NULL` is NULL, `if NULL then` does not branch, and the guard falls through in silence. The
acceptance test — written before the function, and asserting that an invitation cannot be minted into
an organization the caller does not administer — reported `caught: no exception`. An invitation was
minted into an organization the caller had no membership in at all.

The repair is in the helper, not the caller. A caller-side `coalesce(…, false)` fixes one site and
leaves the trap armed for the next person, who has every reason to trust a boolean-returning function
named `is_…`. The intent suite now asserts all three shapes, including the procedural one that
actually broke, so the fix is proven where the defect lived rather than where it was noticed.

## F-41 · The exhaustive prober covered one table and reported three

**2026-09-08 · found while adding a table, by reading the directory instead of the log · fixed in `scripts/check-policies.mjs`**

The generated layer is the one this project points at when it says isolation is _proven_ rather than
asserted. It printed:

```
policy: generated suites for 3/4 RLS tables (organization, organization_invitation, project)
```

and exactly one suite existed on disk.

`check-policies` invoked the generator once per table. Each invocation ends with a reconciliation
step — `reconciled: removed 1 stale generated file(s) no longer part of this run` — which is correct
for the whole-schema invocation the tool documents (_"omit `--table`, with `--emit`, to do every RLS
table in the schema"_) and lethal in a loop: generating `organization` wrote its file, generating
`organization_invitation` deleted it, and generating `project` deleted that. One table survived,
always the last one.

Nothing failed, because `--no-fail` returns zero and the loop counted an exit code rather than a
file. **A count taken from exit codes is not a measurement of coverage.** A second, smaller instance
of the same habit sat beside it: the tool's `010-rls-enabled` guard file was being counted as a
table's suite, which made three probed tables report as four — a number that happened to equal the
table count, and so read as complete.

Now the gate runs once for the schema and reconciles what was **written** against what was planned:
a table with no suite on disk fails the run rather than being counted, and a `NOT_PROBEABLE` entry
that matches no emitted file fails too, because a skip that matches nothing transfers no coverage. It
is a pure function with five mutation proofs, one of which replays the exact one-file directory this
defect produced.

The same run also found `organization_invitation` had shipped with RLS `ENABLE`d but not `FORCE`d —
so its owner, and every `SECURITY DEFINER` function running as that owner, bypassed it. Three other
tenant tables had carried `force row level security` since the foundation migration. The new-table
guard, whose stated job is that every tenant table is protected, did not look for it; it does now,
with a planted `ENABLE`-without-`FORCE` table proving the rule fires.

## F-42 · The accessible-locator rule collided with the framework, and a race hid it

**2026-09-08 · found by the first CI run of the SPEC-006 journeys · fixed in `e2e/pages/index.ts`, `src/app/[locale]/orgs/invitations-list.tsx`, `src/app/[locale]/invite/[token]/accept-form.tsx`**

Three local runs green, then:

```
Error: strict mode violation: getByRole('alert') resolved to 2 elements:
    1) <p role="alert" …>This invitation cannot be used. It may never have…</p>
    2) <div role="alert" aria-live="assertive" id="__next-route-announcer__"></div>
```

Next injects a route announcer into the body for screen readers, and it carries `role="alert"`.
SPEC-002 REQ-3b bans test ids and CSS selectors, so page objects reach for roles — which is the right
rule, and it put the suite on a collision course with the framework. **The project's own discipline
produced the ambiguity.**

What made it survive local runs is the part worth keeping. The announcer mounts after hydration, so
whether it exists when an assertion resolves is a **race**, and a laptop won it every time while a
slower runner lost it on the first try. A green local run was not weak evidence here; it was evidence
of a faster machine.

Measured rather than assumed, by waiting for hydration and counting: `unscoped=2 announcer=1
scoped=1`. Scoping to `main` — where the application's alerts live and the announcer never does —
resolves it, and the measurement is what shows the fix addresses the collision rather than merely
moving past it.

**Then the measurement found a second defect nobody was looking for.** One of the two alerts inside
`main` was empty: `<p role="alert" class="min-h-5 text-sm"></p>`, rendered unconditionally by the
members list. That is not a bug — it is deliberate and correct. A live region has to exist _before_
its content arrives; one created in the same commit as its message is frequently never announced.

The two components written for SPEC-006 rendered theirs conditionally, `{refusal ? <p role="alert">…`
— so every refusal they produced was visible and, for a screen-reader user, silent. Both now hold a
permanent region like their sibling. The page object was corrected to match what its own comment
already claimed it returned: the alert that is **saying something**, not every element with the role.

## F-43 · The meta-gate enumerated gates by filename, and the two it missed both refuse the build

**2026-09-08 · found by asking F-41's question of every counting check · fixed in `scripts/gate-health.mjs`, `scripts/gate-health.test.mts`**

F-41 was a gate that counted exit codes instead of files. The general question it leaves behind is
worth asking everywhere: **does this check count what was produced, or what was attempted?**

`gate-health` is the check that certifies every other check — five properties per gate, including
"it has been shown to fail". Its gate list was:

```js
readdirSync('scripts').filter((f) => f.startsWith('check-') && f.endsWith('.mjs'));
```

which is a statement about **filenames**. Two scripts that `npm run check` runs are not named like
gates, and both refuse the build: `access-matrix.mjs` fails on an access concern nobody explained,
and `battlecard.mjs` refuses to render a citation that does not resolve. Neither had ever been
required to prove it could fail. The list is now derived by following the scripts `check.mjs`
actually spawns, parsed rather than matched, and it is 14 where it was 11.

**The interesting part is what happened when the rule was pointed at the newly-covered scripts.** It
reported `battlecard.mjs` as having three cases named MUTATION and none exercising the module — and
that was **wrong**. The proofs go through a one-line local helper:

```ts
const build = (over = {}) => render({ manifest, specs, fragments, exists: yes, ...over });
```

Every mutation case calls `build`. The rule looked for a direct call to an imported name, saw none,
and condemned three working proofs. Had it been believed, the repair would have been to rewrite
correct tests to satisfy a rule that was itself too narrow — **a false positive in a strictness check
is more expensive than a gap, because the fix it demands is damage.** The rule now resolves local
bindings to a fixpoint: a helper that reaches the gate counts, a helper that reaches nothing does not.

A completeness assertion closes the rest: every script under `scripts/` is either run by `check` or
carries its own mutation proof, so nothing is exempt merely by being absent from a list.

## F-44 · The same race, in a test that had been green for a week

**2026-09-08 · found by CI on an unrelated commit · fixed in `e2e/journeys/protected-route.spec.ts`**

A documentation-only change went red:

```
Error: page.content: Unable to retrieve content because the page is navigating
and changing the content.
```

`/orgs` answers an unauthenticated caller with 200 and a prerendered shell, then redirects on the
client (F-38). The test read `await page.content()` immediately after `goto`, so it was reading the
DOM while the browser was replacing it. Locally it won that race on every run for a week; the runner
lost it.

This is F-42 a second time — a test racing the framework's own navigation, where a green local run
is evidence of a faster machine — and the recurrence is the point. Once is bad luck; twice is a class,
and the rule that falls out of it is sharper than "add a wait":

> **When the page is going to navigate, assert on the response, not on the DOM.**

The fix is not a workaround, it is the better assertion. The property under test is that the
protected route's _response_ carries no tenant data:

```ts
const response = await page.goto('/orgs');
const body = (await response!.text()).toLowerCase();
```

A response body is a fixed artifact. The DOM is a moving one, and this test was asking a moving thing
a question about a fixed one. A `waitForURL` before reading would also have gone green while leaving
the assertion pointed at whatever happened to be rendered by then — which is the login page, not the
thing the test is named after.

## F-45 · The upgrade path's central assumption was false, and the experiment nearly measured nothing

**2026-09-08 · found by running the B-10 experiment for the first time · ADR-008 corrected, `scripts/upgrade.mjs` encodes the result**

ADR-008 chose its whole upgrade strategy on one empirical claim:

> "Policies are migrations. A fixed policy ships as a _new_ migration file. **New files never
> conflict** — a project pulls it in and applies it, however much it has diverged."

A synthetic buyer was scaffolded at `v0.1.0` — cut deliberately before the `is_org_admin` NULL fix, so
the payload was the real F-40 security fix rather than a stand-in — given their own migration dated
after it and an edit to a product page, then handed the fix. The result:

```
Found local migration files to be inserted before the last migration on remote database.
```

The claim is true about text and false about behaviour. The file conflicts with nothing; the **CLI
refuses to apply it**, because its version sorts before the buyer's last applied migration. And that
is not an edge case — it is the ordinary one, because the buyer kept working after they cloned, so
their migrations are always dated later than a fix authored before their work. The single most
important class of security fix was blocked by the mechanism ADR-008 said made it conflict-free.

`--include-all` applies it, and the fix then genuinely lands: `is_org_admin` moved from `NULL` to
`false` on the buyer's database. So the correction is small — the flag is required, and it is not a
workaround but the right instruction for an append-only schema — but the _reasoning_ in ADR-008 was
wrong, and nobody would have found it by reading.

**Two more things broke, and one of them nearly invalidated the experiment.**

**The scaffold shared the upstream database.** Both checkouts carry the same `project_id` in
`config.toml`, so `supabase start` in the scaffold reused the same Docker volume — the "fresh" buyer
came up already holding upstream's schema, security fix included. Measured before noticing: the
buyer's migration history contained `20260908170000` before the upgrade had been applied. An
experiment run in that state proves the fix arrives when it was already there. `supabase db reset`
in the scaffold is what makes the buyer's database actually theirs.

**A generated artifact cannot be delivered by an upgrade.** After the upgrade, upstream's committed
`database.types.ts` contains `organization_invitation` and not the buyer's `customer_note`; the
buyer's contains neither. **Neither file is correct**, because each describes a schema the other does
not have — so shipping upstream's copy would overwrite the buyer's knowledge of their own tables with
a stranger's. Generated artifacts are regenerated locally and never delivered, which is a case none
of the four ecosystems surveyed in `research/10-UPGRADE-PATH.md` addresses.

The reassuring half, which was not designed and is the better news: the **schema guard travelled with
the scaffold and governed the buyer's own table**. `customer_note` — a table upstream has never seen —
was checked for RLS, `FORCE`, and a tenanted `WITH CHECK` by a rule the buyer inherited and never
wrote.

## F-46 · B-10's bar and ADR-008's policy contradicted each other

**2026-09-08 · found by satisfying the bar literally · both corrected in SPEC-013**

ADR-008 says the path is for security: _"Security fixes must reach existing projects; cosmetic changes
need not."_ B-10 says the proof is _"a CI job that scaffolds at the previous tag, applies the upgrade
path, and runs the current suite green."_

Both are reasonable and they cannot both be met. A buyer who takes only the security fix — exactly the
buyer ADR-008 describes — fails the current suite, and it was measured rather than argued:

```
tests/intent/006-invitations.test.sql:30: ERROR:  function public.invite_member(...) does not exist
Failed 19/19 subtests
```

Not a bug. The current suite tests a **feature** the buyer deliberately did not adopt. The bar as
written silently assumes whole-release adoption while the ADR promises selective adoption.

The resolution is a real design decision rather than a wording fix, and it was measured too:
**schema is cumulative and adopted whole; product code is the buyer's and is never touched.** Applying
every new migration — the feature's included — then running today's suite passes completely, while the
buyer's edited page keeps saying what they made it say. Schema is cheap to accept and expensive to
skip: it is additive, its tests come with it, and a half-adopted schema is a state neither side has
ever tested. Product code is the opposite, and touching it is what makes the supastarter warning true.

## F-47 · The flagship guide taught the defect

**2026-09-08 · found by reading the guide against work done the same day · fixed in `CONTRIBUTING.md`**

`WEBSITE-AND-DOCS.md` names "Add a tenant-scoped table" as the flagship guide, because it is "the most
common task and the one where people leak data". The recipe in `CONTRIBUTING.md` said:

```sql
alter table public.thing enable row level security;
```

`ENABLE`, not `FORCE`. That is precisely the defect `organization_invitation` shipped with hours
earlier (F-45's run) — on Supabase the owner is `postgres`, not a superuser but carrying
`rolbypassrls`, so `ENABLE` alone leaves the owner reading every tenant's rows and every `SECURITY
DEFINER` function with it, because those run as the owner. Measured on a table built exactly as the
guide said:

```
RLS forced? false
```

The same measurement found a second gap, in the opposite direction. Default privileges were
deliberately stripped from this schema (`20260908140000`), so the recipe's table has no grant at all:

```
authenticated SELECT grant: false
```

A table nobody can read. That one fails **closed**, so it costs a confused half-hour rather than a
leak — but it means the flagship guide, as written, did not work.

The uncomfortable part is the sequencing. The schema guard learned to catch a missing `FORCE` on
2026-09-08 because a table shipped without it; the guide that teaches people to write those tables was
not read on the same day, and would have kept teaching it. **A gate catching a defect is not the same
as the defect being unlearned**, and the documentation is where it gets unlearned. That is the
argument for ADR-019 rather than a general belief that documentation is good.

## F-48 · The upgrade job could pass while delivering nothing, and B-10 was already claimed on it

**2026-09-08 · found by review after the bar was claimed · fixed in `scripts/upgrade.mjs` and the `upgrade` job**

`scripts/upgrade.mjs` computed which files an upgrade may take and then did this:

```js
if (take.length) run('git', ['checkout', release, '--', ...take], cwd);
```

An empty plan skipped the checkout **silently**. Everything after it still passed:

- `supabase migration up --include-all` ran as a no-op;
- `supabase/tests/intent/` is upstream-owned, so today's suite only arrives **if the upgrade took
  files** — an empty plan leaves the scaffold running the previous tag's tests against the previous
  tag's schema, which is green;
- and "the buyer's own code survived" was satisfied by nothing having moved.

So the job asserted _"the upgraded project passes its own tests"_ while claiming _"passes today's
tests"_. Those coincide only when the upgrade actually happened, and any silent diff failure — a
wrong ref, a rename, a shallow checkout — separates them without a word. **B-10 had already been
claimed on this job**, and its first two green runs were genuine only because the plan happened to be
non-empty.

Verified rather than reasoned:

```
$ node -e "import('./scripts/upgrade.mjs').then(m=>console.log(JSON.stringify(m.planUpgrade([]))))"
{"take":[],"leave":[],"regenerate":[]}
```

**It is the same defect as F-41, one layer up**, and the rule that catches F-41's shape was already in
this repository: `checkPositiveControls` exists because a generated suite whose every assertion is a
denial is equally green against an empty database. A job whose every step is satisfied by absence is
equally green against an absent upgrade. Writing that rule did not stop me writing the same hole in
the next thing I built, which is the part worth recording — a lesson learned in one place does not
transfer by itself.

Both layers now require something present. `assertPlanDelivers` refuses a plan that takes nothing and
exits `2` (verified: `real exit code: 2`). The job computes a file **added** to an upstream-owned path
since the tag and requires it in the scaffold, and refuses a release where no such file exists rather
than passing vacuously — because a run that cannot prove anything is not a passing one.

## F-49 · Nothing runs `next build`, and the handover trial is what noticed

**2026-09-08 · found by the B-11 agent trial · recorded, not fixed**

`npm run check` runs `next typegen` and `tsc --noEmit`. Neither is `next build`, and the build has its
own route-type checking that the pair does not reproduce. The only place a build happens is inside the
journey layer's Playwright `webServer`, which means **a build-only failure surfaces as "the web server
did not start"** — a message that reads like infrastructure and sends the reader to look at ports.

An unfamiliar participant found this in half an hour, and the way it found it is the point: it could
not run the build at all in its worktree, so it ran the journeys against `next dev` instead. One of
its own tests asserts F-38 behaviour — that a protected route answers a stranger with a 200 shell and
no tenant data — which is a **production-render** property. Dev agreeing with it is weaker evidence
than the suite intends, and nothing said so.

It also reported that `next build --webpack` fails on this repository **with and without its change**,
rejecting the named export a `page.tsx` carries for its test — and it ran the control to establish
that it had not introduced the failure. Whether the default Turbopack build rejects the same pattern
is **unknown**, and that is the honest state: two protected pages already use it.

Not fixed here, deliberately. Adding a build step to `check` is a real decision — it is the slowest
thing that would be in it, and SPEC-003 treats the gate count as a ceiling rather than a floor — and
the trial's job is to find, not to choose. What is recorded is that the gap exists, that it was
invisible from inside, and that the first person to look from outside hit it immediately.

**Answered 2026-09-09, by running it.** The default build **accepts** the pattern — `npx next build`
is clean on this repository, so the two protected pages are not a latent build failure and there was
nothing to fix in them. The disagreement between the two builds is real and has a mechanism, which is
**F-51**; the decision this finding declined to make is **F-52**, and it went the way of adding the
step, though for a different reason than this finding supposed.

## F-50 · A fix for a documentation defect introduced a documentation defect

**2026-09-08 · found by the B-11 agent trial · fixed in `CONTRIBUTING.md`**

F-47 corrected the flagship "add a tenant-scoped table" recipe, which had taught `enable row level
security` without `force`. The correction added both missing lines to the code block **and** prose
explaining them, including:

> "Measured on a table built exactly as written above: `RLS forced? false`."

That sentence was true of the recipe as it stood **before** the same commit fixed it, and false the
moment it landed — "as written above" now pointed at a corrected block that does force RLS.

The trial's participant read it exactly as written and reported that the recipe "omits `force row
level security` and the grant in the code block while explaining both in prose immediately below".
**Its diagnosis was wrong and its finding was right**: the block is correct, and the passage
contradicts itself badly enough that a careful newcomer concluded the opposite of the truth.

The general shape is worth more than the instance. **A correction written in the same breath as the
thing it corrects tends to describe the old state in the present tense**, because its author is
holding both versions in mind and the reader only ever sees one. The repair is to date the claim —
"as it stood before that date" — rather than to point at "above".

## F-51 · The two builds do not ask the same question, and the default one asks less

**2026-09-09 · measured while answering F-49 · recorded**

F-49 left it unknown whether the default build rejects the named export two protected pages carry for
their tests. It does not. Both builds were run on the same tree, at `fa6bb44`:

| Command                    | Result                                                             |
| -------------------------- | ------------------------------------------------------------------ |
| `npx next build`           | clean, every route generated                                       |
| `npx next build --webpack` | `TS2344` on both pages — `Property 'Organizations' … type 'never'` |

So the two protected pages are fine under the build this project actually runs, and the trial's
report was accurate about webpack and did not generalize.

**Why they differ.** They emit different validators. Webpack writes one file per route containing an
exhaustive `checkFields<Diff<{…known exports…}, TEntry, ''>>` — a module may export _nothing else_, so
a named export is an error. Turbopack writes a single `.next/types/validator.ts` asserting each page
`extends AppPageConfig<Route>`, which is a shape constraint: extra exports satisfy it.

**And that constraint is weaker than it looks.** Its `default` field is typed

```ts
default: React.ComponentType<{ params: Promise<ParamMap[Route]> } & any> | ((props: …& any) => …)
```

`X & any` is `any`, so the props type is unconstrained. Measured: giving a page
`{ params: { deliberatelyWrong: number } }` — not even a Promise — builds clean. The Turbopack page
validator cannot fail on a page's props shape.

**The consequence corrects F-49's premise.** F-49 said the build "has its own route-type checking that
the pair does not reproduce". For the default build that is false: `npx next typegen` emits a
`validator.ts` **byte-identical** to the build's (`diff` reports no difference), and `tsconfig.json`
includes `.next/types/**/*.ts`, so `typegen` + `tsc --noEmit` — already the first two steps of `check`
— perform the default build's entire route-type check. The premise held only against webpack, which
`npm run build` does not run.

The practical reading: **the named-export-for-tests pattern is portable only as long as this project
stays on Turbopack.** Nothing enforces that, and switching bundlers would surface as two type errors
in pages nobody touched.

## F-52 · Nothing rendered a page, and that — not route types — is what the build was worth

**2026-09-09 · measured while deciding F-49 · fixed by adding a `build` step to `npm run check`**

With F-51 removing route types as the reason to add a build, the question became whether it is worth
anything at all. One mutation settles it. A single line added to the home page's component:

```ts
throw new Error('deliberate prerender failure');
```

| Command            | Exit | Says                                                               |
| ------------------ | ---- | ------------------------------------------------------------------ |
| `npx tsc --noEmit` | 0    | nothing                                                            |
| `npx next build`   | 1    | `Error occurred prerendering page "/en"` · names the file, line 39 |

Every other step in `check` is blind to it. Thirteen steps, a 135-assertion policy suite, and a page
that throws on render was green — because no step rendered a page.

**Cost, measured — and the total is the wrong number to look at.** The step's own cost is stable:
**11-16s** across five cold runs (median ~12.6s), reported on its own line in the summary. The loop
total is not stable. Three consecutive cold runs of the whole suite came in at **119.6s, 82.1s and
51.1s** on the same tree — and that last one, _with_ the build in it, is faster than a 52.2s run
measured without it the same afternoon. On a working laptop the total is dominated by what else the
laptop is doing.

So the honest form of the cost argument is not "+21%". It is: the build costs about twelve seconds,
that is less than `unit` (15-21s) already costs, and the variance between two runs of the unchanged
suite is several times larger than the step being added. SPEC-002 REQ-7's constraint is that the loop
must not be "slow enough to be skipped"; nothing here moves it toward that, and a projection that
claimed a precise new total would have been the confident-and-wrong thing this repository keeps
catching.

**It does not spend SPEC-003's ceiling.** That ceiling counts gates, and `status.mjs` computes the
gate count by listing `scripts/check-*.mjs` — eleven files, each with a mutation proof. `check.mjs`
already runs thirteen _steps_, five of which are build and test tools rather than rules: `typegen`,
`typecheck`, `format`, `lint`, `unit`. A build is a sixth of those, not a twelfth gate. Reading it as
a gate would also make `tsc --noEmit` one.

**It needs no database.** `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:59999 npx next build` exits 0:
every route is partially prerendered, so the shell is built and each tenant query is deferred to
request time. The step is therefore not marked `needsDb`, and adds no new prerequisite to `check`.
That the shell builds with no database reachable at all is also the sturdiest corroboration of F-38
this repository has — the prerendered response cannot contain tenant data, because there was nowhere
to fetch it from.

**Precedent, rather than a new judgement.** `check.yml` already made this call for the journey layer,
in a comment that argues the same thing: "the whole argument for this layer is that it sees what the
others cannot, which is worth nothing a day late." A build-only failure landing nightly, or in CI
only, has that shape.

**What it also repairs.** Until now the only build in the project ran inside Playwright's `webServer`
(`playwright.config.ts:36`), so a build failure reached the reader as _"the web server did not
start"_. That is F-49's actual complaint, and a named step fixes it whatever else is true — the
failure now arrives as `✗ build`, before the journey layer is reached.

**Still open, honestly.** The journey suite's premise is a production render, stated at
`playwright.config.ts:34`. Nothing _enforces_ that the suite ran against a build: the B-11
participant could not build and silently ran the journeys against `next dev`, and no assertion
noticed. The premise is documented; it is not checked. Recorded rather than fixed here, because it is
a different change from this one.
