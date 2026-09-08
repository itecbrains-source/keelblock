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
