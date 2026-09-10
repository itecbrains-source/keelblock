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

**Refined 2026-09-09, while preparing this for publication.** The fix is narrower than the entry
implied, and the catalogue says so: `alter default privileges` only rewrites entries for roles you
can act for. On this repository, `pg_default_acl` for `public` now reads
`postgres | {postgres=arwdDxtm/postgres,authenticated=m/postgres}` — anon gone — while Supabase's own
`supabase_admin | {…,anon=arwdDxtm/…}` entry is untouched and cannot be altered from a migration.
Every table a migration creates is created by `postgres`, so the practical exposure is closed; the
default entry is not. The disclosure artifact states both — `docs/disclosures/anon-can-truncate.md`.

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

## F-53 · An adversary planted a privilege escalation and all fourteen steps stayed green

**2026-09-09 · DEF-020's adversarial trial · the hole is closed; the row stays open**

SPEC-002's Definition of Done asks for something its author cannot supply: _someone other than the
author planted a policy defect and confirmed the harness caught it._ This is that trial, run against
the **policies** rather than the gates, by a session given the schema, the harness and one
instruction — plant a defect the suite does not catch — and told that a miss was the outcome worth
having.

It found one, in seven attempts.

```diff
 create policy project_delete on public.project
-  for delete to authenticated using (public.is_org_admin(organization_id));
+  for delete to authenticated using (public.is_org_member(organization_id));
```

One word. Reproduced independently rather than taken on report: as a real signed-in user whose
`org_role_of` is `member` and whose `is_org_admin` is **false**, `delete from public.project` returns
`DELETE 1`. A plain member destroyed a project the policy reserves for admins and owners. Then
`npm run check`: **all 14 green, exit 0** — 136 pgTAP assertions, the schema guard, the generated
prober, the boundary walker, every one of them satisfied.

**Three independent things had to line up, and did.**

1. `check-schema-guard.mjs` read `polwithcheck` and nothing else. `DELETE` has no `WITH CHECK`, so a
   DELETE policy was never examined at all — and neither, it turns out, was any `USING` clause on any
   command, which is a wider hole than the one the trial walked through.
2. The generated prober **mocks** `is_org_member` and `is_org_admin` to constants, because that is
   what makes it exhaustive. Both mock identically, so swapping one for the other is invisible to it.
   Where the choice of helper _is_ the access control, the exhaustive layer verifies wiring and not
   authority. The repository already says this; what it did not say is which commands were therefore
   uncovered.
3. Nothing exercised `project` DELETE. `grep "delete from public.project" supabase/tests/intent/`
   returned nothing.

The layer designed to catch exactly this — the intent suite, the only one that looks inside the
helpers — had a gap precisely where the other two were blind.

**The two near-misses are the more interesting half.** Both were invisible to every gate that looks at policies and
both failed to leak anyway, for reasons nobody wrote down:

- `organization_member_update`'s `WITH CHECK` was weakened to a tautology dressed as a null guard.
  It passed every gate. It still could not move a membership row into another tenant, because
  PostgreSQL applies the **SELECT policy's `USING` and the INSERT policy's `WITH CHECK` to the new
  row** during a row-moving UPDATE. A policy other than the one weakened held the line.
- `organization_delete` was changed from `org_role_of(id) = 'owner'` to `>= 'owner'`. The enum is
  declared `('owner','admin','member')`, so `'owner'` sorts **lowest** and `>= 'owner'` admits every
  role — an expression that reads as "owner or above" and means "anybody". It passed every gate. The
  cascade to the owner's membership row then hit `enforce_owner_authority` and raised.

So the schema survived twice on **defence in depth it was never credited with**, and the honest
reading is that a green suite was not what protected it on those two occasions. That is worth more
than the defect: it says the isolation is real, and it says the gates would not have told anyone.

**Closed here.** An intent assertion — a plain member cannot delete their organization's projects —
whose mutation proof is the planted diff itself: restore it and the gate exits 1 with
`have: 0, want: 1`. And the schema guard now reads `USING` as well as `WITH CHECK`, on
`SELECT/UPDATE/DELETE/ALL`, with the same two rules (must mention the tenant key; a bare null test on
it is not a constraint). Proven live: a `select ... using (true)` planted on `project` takes the gate
from green to `has a USING that never mentions the tenant: true`. That rule does **not** catch the
trial's defect — `is_org_member(organization_id)` is a correct tenant scope and the wrong authority,
which a catalog-shaped rule cannot distinguish — and it is added because the trial exposed that the
entire read-and-delete decision was unexamined, which is a bigger hole than the one that was walked.

**DEF-020 stays open, and this trial is not what closes it.** The row asks for "a second competent
person"; a session spawned by the author is not one, and DEF-024 makes the same distinction for the
human half of B-11. What this establishes is narrower and still worth having: an adversary who did
not write the harness got through it in seven attempts, and the three reasons it got through are now
two fewer.

## F-54 · The matrix that proves the claim was reporting a mock, on the row that matters most

**2026-09-09 · found while closing F-53's class · fixed in `scripts/access-matrix.mjs`**

`docs/ACCESS-MATRIX.md` opens by saying what it is for:

> "Derived from the live policy catalog by probing each table as each identity, so it describes what
> the database _does_, not what anyone believes it does."

For three of its four rows that was true. For **Authenticated · member** — defined in its own legend
as _"a member of the organization that owns the row"_ — it was not, and the reason is F-53's reason:
`rlsautotest` mocks `is_org_member` and `is_org_admin` to constants, which is what makes it
exhaustive across identities without a fixture per role. So that row reported what **a mock admits**,
which for any admin-gated command is an admin.

Measured against a real signed-in member of the owning organization, four published cells were wrong
— every one of them claiming a member could do something a member cannot:

| Command                          | Published | A real member |
| -------------------------------- | --------- | ------------- |
| `organization` UPDATE            | ✓         | refused       |
| `organization` DELETE            | ✓         | refused       |
| `organization_invitation` SELECT | ✓         | refused       |
| `project` DELETE                 | ✓         | refused       |

Two independent derivations agree on all twelve policied commands: a live probe as a real member,
and the authority each policy declares through `pg_depend`. The artifact disagreed with both.

**The wrong glyphs are the smaller half.** F-26's argument for this artifact is that a policy change
altering who can reach what **cannot merge without the diff appearing in review** — "a reviewer who
sees a new ✓ in the different-organization column has caught a tenant leak in a document, before it
reaches a user". A mocked member row is **byte-identical whether a command asks for admin or for
membership**, so that guarantee never held for the authority class. It is not a hypothesis: when the
adversarial trial downgraded `project_delete` from `is_org_admin` to `is_org_member`, the whole suite
passed _including_ `generated`, which regenerates this matrix and compares it byte-for-byte.

**Fixed by measuring.** The member row now comes from a real member — one fixture, one identity,
every policied command, each in a rolled-back transaction — and `exp` is what the policy _intends_
for a member, read from the helpers it depends on. So the two can now disagree, and a policy that
says admin-only while a member gets through renders `⚠` where it previously could not be expressed
at all. Proven against the same defect the trial used: with `project_delete` downgraded,
`access-matrix --check` exits 1 and reports the file STALE. Before this change it exited 0.

That also closes the hole the authority rule leaves open by construction. That rule requires an
assertion for the authority a policy _currently declares_, so downgrading a policy and deleting its
assertion in one change makes it fall silent. The matrix does not fall silent, because it is not
reading the policy's claim about itself.

**A defect in the fix, found by testing the fix.** The first probe ran every attempt in one
transaction, in alphabetical order. `DELETE` sorts before `SELECT` and `UPDATE`, so on the run where
the policy was downgraded the delete **succeeded** and destroyed the row the later commands were
measuring — and one weakened policy moved three cells, two of them to `⚠ blocked but should be
allowed`, an anomaly the database never produced. Each attempt now runs in its own subtransaction
that is abandoned before the next begins. A measurement whose answer depends on the order it ran is
not a measurement, which is F-28 and F-29 in a third costume, and it was visible only because the
mutation was tried rather than reasoned about.

## F-55 · The login page argued a security position the platform does not support

**2026-09-09 · found by a review comparison, settled by measuring · fixed in `messages/en.json` and ADR-021**

The review asked a paperwork question: password is listed in `docs/PRODUCT.md`'s scope, the login
page says there is no password, and no ADR decides either way — so which is stale? It expected an
hour of writing and no code.

Measuring it first turned a bookkeeping mismatch into a defect. Against the local stack, through the
**publishable** key that ships to every browser:

```
POST /auth/v1/signup            {email, password}    → 200, session issued
POST /auth/v1/token?grant_type=password              → 200, session issued
select encrypted_password is not null from auth.users → t
```

The subtitle read **"We email you a link. There is no password to forget or leak."** There is one.
Anyone can create it, the grant that accepts it is live, and the hash is stored — the login page
simply does not render the box. So the sentence was not an undecided position, it was **false**, and
it was false in the worst available place: user-facing copy, on the first screen, making a security
claim.

**It cannot be made true by configuration.** Supabase's CLI config reference has no key that
disables password sign-in while leaving magic link working, and Supabase's own guidance treats the
choice as a client-side one. So the honest fix is the copy, not a setting: the subtitle now says what
the product does and asserts nothing about what does not exist underneath it. ADR-021 records the
decision that was being made by implication, and — because an ADR alone erodes the first time
somebody adds a form — `findPasswordSignIn` in the boundaries gate now fails the build if any module
calls `signInWithPassword`. Parsed, not searched, because the name appears in the ADR, in the rule's
own comment and in the test that proves it.

**The general shape.** A UI string is a decision with nobody's name on it. This project already made
a point of settling six undecided things; it did not notice that the most exposed one had been
settled in `messages/en.json` by whoever wrote the sentence, and settled wrongly. **Copy that argues
a position is a claim, and a claim gets checked like any other** — the difference between this and
the six is that this one could be tested in three HTTP requests, and nobody had.

**A second thing the measurement corrected, in the review rather than the repository.** The same
review proposed a battlecard row: this kit ships one authentication method and proves it, while the
field ships five and proves none. The second half is not true. BoxyHQ's repository carries
`tests/e2e/auth/sso.login.spec.ts`, `tests/e2e/auth/idp-initiated.spec.ts` and
`tests/e2e/settings/directory-sync.spec.ts` — they prove several. The row was not written. It was
offered conditionally ("if it reads true"), which is the right way to offer one, and checking took
two minutes against the claim's own source.

## F-56 · B-6 was measured by removing a module, and the gates turned out to be most of the test

**2026-09-09 · measured before authoring SPEC-014 · recorded, nothing removed**

B-6 says any optional subsystem is removable in one commit, SPEC-014 owns it, and SPEC-014 has been
`planned` since the first spec index. Nobody had established what removal actually costs. So the
invitations subsystem (SPEC-006) — the most module-shaped thing in the tree — was deleted for real
and the whole loop run against the result. Everything below was restored.

**The first measurement was wrong, in the direction this session was already watching for.** Deleting
the module's three files broke `typecheck` on `orgs/page.tsx`, and "B-6 is not satisfied" was about
to be written down. But no real removal deletes a module and leaves its call sites — the claim was
broader than the experiment. Redone properly, deleting the files **and** their call sites:

| Gate               | Result                                                                        |
| ------------------ | ----------------------------------------------------------------------------- |
| `typecheck`        | green                                                                         |
| `build`            | green                                                                         |
| `unit` (500 tests) | green                                                                         |
| `policy`, `schema` | green                                                                         |
| `locale`           | **16 orphan translation keys**                                                |
| `unused`           | **3 dead server actions**, then a shared `useRouter` whose only caller it was |
| `lint`             | 3 now-unused locals                                                           |
| `promises`         | **`SPEC-006: artifact 'src/lib/orgs/invitations.ts' does not exist`**         |

**The finding is that the last four columns are the removal test.** Every failure names exactly one
leftover, in the file it is in, and stops naming it when it is gone. Removing the module completely
meant editing five files across three shared modules — the page, the actions, the messages, the
navigation helper — and at no point was there any archaeology: the gates produced the checklist.

That is ADR-017's argument, confirmed rather than assumed. It chose directories over packages partly
because "`knip` already fails on an unused export or dependency, which is the same question asked
continuously". It does, and continuously turns out to be the important word — the property is being
enforced on every push already, without SPEC-014 existing.

**What SPEC-014 is therefore actually for**, which is narrower and clearer than "a deletion test":

- **Doing it per module without a human**, so removability is proven rather than demonstrable.
- **Deciding what removal means for the spec that owns the module.** `promises` is the one failure
  that is not a leftover in code: SPEC-006 still claims an artifact that no longer exists, and a
  complete removal has to retire the spec with the code. No other gate asks that question.
- **Deciding what removal means for the schema.** Nothing above touched the database. The
  `organization_invitation` table, its policies and its pgTAP file all still exist and all still
  pass, because a migration cannot be un-run. Removability here is a **code** property, and saying
  so is better than letting a buyer discover it.

**A fourth data point for the caveat on the review series.** The same review that prompted this
described SPEC-031 as "already specced, unblocked". It is neither: `spec/README.md` marks it
`planned`, no `SPEC-031-*.md` exists, and its declared dependencies include SPEC-007, which is the
`draft` blocked on the owner's REQ-7 decision. Both halves of a two-word claim, wrong, and wrong
generously. The review's B-6 recommendation, by contrast, held up under measurement — which is the
point of checking rather than discounting: the bias is a prior, not a verdict.

## F-57 · Two green jobs, each honest about its own half, with nothing crossing between them

**2026-09-09 · predicted from a pattern, then tested · closed by construction**

F-41, F-48, F-49, F-53 and one unnumbered fix share a shape. F-41 counted exit codes rather than files. F-48's upgrade job asserted
the tests passed but never that the upgrade delivered anything. F-49 found nothing runs `next build`.
F-53 found nothing exercised `project` DELETE. And `03503ee` found `create-keelblock-app` died on its
last line, green suite and all, because nothing ran the CLI. **Components proven, composition unrun**,
every time — and every fix was the same move: run the real thing end to end and assert something must
be PRESENT.

Applied forward rather than backward, it named a live gap:

- the `upgrade` job scaffolded with `git worktree add` and proved **that** project upgrades;
- the `scaffold` job used `create-keelblock-app` and proved **that** project checks green;
- **nothing proved a CLI-scaffolded project could be upgraded.**

The seam was not incidental. SPEC-011's memo made provenance the load-bearing question, and
`upgrade.mjs` consumes exactly that — a worktree carries every ref in keelblock's repository and
satisfies it for free, which is precisely the shape no buyer has. The memo had already measured the
alternative dying with `fatal: bad object`. So the one job that could have caught a provenance bug
was structurally incapable of it.

**Tested: it works.** A project scaffolded by the CLI at `v0.1.0`, given the two commands the
scaffolder prints, took an upgrade to HEAD — 60 upstream-owned files, migrations applied, 65 left
alone, and the positive control file present.

**Closed by making one job consume the other's output rather than by adding a third.** The `upgrade`
job now scaffolds with `create-keelblock-app` instead of `git worktree`, so what gets upgraded is
what the tool produces, and it asserts the provenance record before starting — a scaffolder that
quietly stopped writing one fails there rather than somewhere subtler. B-1 and B-10 are joined by
construction, and neither can go green over the other's gap.

**What is worth keeping is the method, not the result.** The prediction was that this would fail; it
did not. That is the cheaper of the two outcomes and it was still worth ten minutes, because the
other outcome was a defect a buyer would have found first. A recurring shape is worth pointing
forward at the seams nobody has looked at yet — and the answer "we checked, it holds" is only
available to people who checked.

## F-58 · The contracts gate asked a question about the machine running it

**2026-09-09 · found by review after `7a1661a` fixed the instance by hand · fixed in `scripts/check-contracts.mjs`**

`7a1661a` corrected SPEC-012's AC-6, which cited `/tmp/stranger` as its evidence. The correction was
right and the hole it went through stayed open.

The gate already refuses a glob, with the reason in its own comment: _"A glob is a description, not a
path — and cannot be verified, so it is refused outright."_ An absolute path is the same category
error and was not refused. `existsSync('/tmp/stranger')` is not a question about this repository; it
is a question about whoever is running the gate, and it answered **yes** locally because a rehearsal
had created that directory ten minutes earlier, and **no** on a clean runner. A gate whose verdict
depends on the machine has not checked anything.

Refused now before the existence check, so a path that happens to exist locally cannot buy a pass.
`..` is refused with it, for a second reason: it resolves against the gate's working directory rather
than against the spec file that wrote it, so the same citation means different things to different
readers.

**Swept before landing**, because a rule that turns the gate red on real rows is worse than the hole:
the gate's own parser was run over every spec and reported **119 cited paths, none** absolute,
home-relative or escaping. The mutation proof restores SPEC-012's pre-`7a1661a` text verbatim and
asserts the refusal **with `exists` returning true** — a rule that only works when the file is
missing would not have fixed this.

## F-59 · Three deferrals wait on a release process no spec owns

**2026-09-09 · found by review · two corrected, one left with its reasoning recorded**

DEF-027's body says the blocker is publishing — _"a release act, it is outward-facing, and it is the
owner's"_ — and its trigger read `spec-done:SPEC-016`. So when release-preflight lands, the row would
have reported itself unblocked whether or not anything was ever published. That is the defect
DEF-026 was split out of DEF-018 to fix, committed the next day by the person who split them.

**Reading SPEC-016 rather than its title settles it.** It asks _"is it safe to put this in front of
paying customers"_, it is _"aimed squarely at the team that bought keelblock and is deploying a
commercial product"_, and it mentions publishing, npm and the registry **nowhere**. It is the buyer's
deployment gate. It is not keelblock's release process.

Which surfaced the larger thing: **three rows key on `spec-done:SPEC-016`** — DEF-022 (security
advisories, which "need a release process to hang from"), DEF-023 (a dated record of what each proof
run proved, waiting for "once releases exist"), and DEF-027. All three are waiting for keelblock to
have a release process, and **no spec in the set owns one.** They were each keyed to the nearest spec
whose title contains the word Release.

Two were mine and are corrected to `decided:` tokens, which is the honest form when the event is an
unobservable human act (DEF-020's precedent, and the registry's own table says so). **DEF-022 is left
alone**: its body reasons explicitly that SPEC-016 _is_ the release process, which is a considered
choice by someone else on a draft spec, and rewriting it on my reading would be the over-reach. It is
named here instead, so the shared root is visible rather than fixed twice and unfixed once.

The general shape: **a trigger keyed on the nearest plausible spec fires on an adjacent event.** It
is worse than `decided:`, which never fires and admits it — a spurious fire spends attention and
teaches the reader to wave the next one through.

## F-60 · A capability promised in two customer-facing documents and owned by nothing — and one of the promises was left behind by the ADR that refuted it

**2026-09-09 · found by review, swept wider than reported · fixed**

`docs/PRODUCT.md` line 188 declares area 2 as _"Auth (magic link, OAuth, passkeys, 2FA — **no
password**, ADR-021)"_.

```bash
grep -rl passkey spec/     # no matches
```

2FA is registered as DEF-017. **Passkeys are owned by no spec and by no deferral.** What makes that a
defect rather than an oversight is where the omission sits: SPEC-004's non-scope list is otherwise
exhaustive — organizations, invitations, SSO, SCIM, per-account lockout, MFA and the audit log, each
with a reason and an id. Passkeys is the one item in its own area's declared scope that the spec
neither builds nor refuses.

**The sweep found a second instance, and it is worse.** `README.md` line 96 read:

> auth (password, magic link, OAuth, passkeys, 2FA, verification, reset, unlock)

ADR-021 was accepted the same day and decided against three of those words — _"No password field, no
password reset, no account-unlock flow."_ ADR-021's own Context quotes `PRODUCT.md`'s pre-decision
wording as the thing to fix; `PRODUCT.md` was fixed and the README was not. So the first document a
buyer reads advertised a password surface the repository had refused, while
`scripts/check-boundaries.mjs` was already failing the build for any module that called
`signInWithPassword` — **the code enforced the opposite of the marketing**, and that is the direction
that gets noticed publicly.

**Why nothing caught either.** The promises gate is the one that would have, and it is looking at a
different list. It checks that every acceptance bar `B-n` has an owning spec — a **table**, which
parses cleanly. The capability list is nineteen areas with their sub-items in parentheses, which is
**prose**, and that gate's own comments refuse to parse prose: _"A gate that reads prose reports
defects that are its own."_ So the bars are enforced, the capabilities beside them are not, and the
gap between the two is the width of one word inside a parenthesis.

A gate is possible and is not cheap, and the shape it needs is recorded here rather than guessed at
later: **one row per named capability with an owner column**, replacing the prose, so that
`passkeys | DEF-028` becomes a parseable claim. That restructures the governing document and changes
how `PRODUCT.md` reads, so it is named here rather than done in the change that found the defect.

**Fixed:** DEF-028 files passkeys with its reason and trigger; SPEC-004's non-scope names it beside
MFA; the README's auth list now says what ADR-021 decided.

The general shape: **a gate over the structured half of a document teaches every reader that the
whole document is checked.** The bars had been enforced long enough that the list beside them read as
enforced too.

## F-61 · A spec said no deferrals were waiting on it while three were armed to fire the moment it closed

**2026-09-09 · measured while checking a review claim · fixed**

A review record described SPEC-007 (billing) as the most load-bearing unfinished document and cited
three specs depending on it — 003, 011 and 031. That dependency does not exist: the column in
`spec/README.md` is headed **ADRs**, and those rows cite ADR-004, ADR-006 and ADR-007. Read as a spec
dependency it is a coincidence of numbering.

**The conclusion survives on different and stronger evidence.** What actually keys on SPEC-007:

```bash
grep -n 'SPEC-007' spec/*.md | grep -v '^spec/SPEC-007'
```

Two done specs name it as a contract (SPEC-001, SPEC-005), and **two deferrals are armed on
`spec-done:SPEC-007`** — DEF-011 (mutation testing over application logic, which "earns its keep the
moment money math exists") and DEF-012 (property-based testing, which wants an invariant like
"splitting a payment conserves every cent"). DEF-029 now joins them. A trigger firing **fails the
build**, so the day SPEC-007's status becomes `done`, `npm run check` goes red three ways.

**The defect is not the arrangement, it is that the spec said the opposite.** SPEC-007's Deferrals
section read _"None filed yet"_ — true of rows filed **by** it, false of rows waiting **on** it, and
the sentence a reader takes away is the second one. That this is worth writing down is not a
judgement call: **SPEC-004 already carries exactly the warning**, in the same section, in these
words — _"marking this spec `done` fails the build until three other pieces of work are picked up"_ —
so the convention exists, was applied once, and was not applied to the draft.

I first wrote this finding claiming nobody had noticed the pattern. Reading SPEC-004's own Deferrals
section before committing showed it was noticed, named and written down, and only this instance was
missing. That correction is the finding: **a convention applied to one spec and not its sibling is
harder to see than one that was never invented**, because the reader who checks one place finds it
there and stops.

**Fixed:** SPEC-007's Deferrals section now names the three rows and what closing it costs.

The general shape: **"none filed" answers a different question from "none waiting", and a deferral
registry is read in both directions.** The dependency graph the build evaluates lives in triggers,
and a spec is the only place a reader will look for its own edges.

## F-62 · The requirement that says "no REQ without an AC" was the one requirement nothing checked

**2026-09-09 · found while recording an owner decision · fixed**

SPEC-007 REQ-7 was decided by the owner, which made it testable for the first time. Writing its
acceptance criterion showed it had never had one — and then that nothing would ever have said so.

SPEC-003 REQ-7 declares **five** rules, and the first of them is the one that was missing:

> no REQ without an AC, no AC verifying a non-existent REQ, no source-of-truth path that does not
> exist, no `TODO`/`FIXME`/`@defer` without a registry entry, no registry entry without a
> machine-evaluable trigger.

Its acceptance criterion, AC-7, was marked **done** and cited three proofs — a dead source path, an
orphan `@defer`, a trigger-less entry. Those are rules three, four and five. **Rules one and two had
no proof and no implementation**, in the requirement whose whole subject is that a requirement
without a proof is not done.

```bash
node scripts/check-contracts.mjs   # 13 spec(s), 50 reciprocal contract(s), 108 REQ all verified
```

That line reads `108 REQ all verified` only since this change; the rule that counts them did not
exist, and three requirements were uncovered: SPEC-007 REQ-7, and SPEC-016 REQ-1b and REQ-1c, which were
inserted after their AC table was written — the `b` and `c` are the tell — and never added to it.

**Why `npm run status` could not have shown it.** It counts requirements and criteria separately and
prints them together, so SPEC-007 read `8 REQ · 0/8 AC` while one requirement had none and another
had two. **A count that reads as coverage**, which is the F-60 shape again: the number is accurate
and the sentence it forms is false.

**Fixed:** both rules now run inside the contracts gate — `checkReqCoverage` and `checkAcTargets` —
each with mutation proofs, one of them restoring the defect in a real spec rather than a fixture.
Neutering the rule turns four tests red. The three uncovered requirements are covered: REQ-7 by three
new criteria, SPEC-016's two by transcribing what their requirements already state. AC-7 now names
all five rules and what proves each.

**One near-miss worth recording**, because it decided the design. The second rule reported a defect on
its first run: SPEC-011 AC-7 verifies `REQ-1..4`, which is a **range**, and a naive parse reads it as a
citation of a requirement called `REQ-1..4` that nobody wrote. That is a false positive on a correct
row, and a false positive on a correct row is how a gate gets exempted into uselessness — so ranges
are expanded, `REQ-1b` is not mistaken for an endpoint, and both are pinned by tests.

The general shape: **a gate is trusted for the rules it was named after, not the rules it runs.**
Everyone had read "no REQ without an AC" — it is in SPEC-003, and every spec's Definition of Done
repeats it — and nobody had asked which of the five sentences in that list had code behind it.

## F-64 · The sign-in button rendered its own translation key, on a spec marked done, because nobody had ever set the variable that makes the button exist

**2026-09-09 · found while closing DEF-018 · fixed**

DEF-018 asked for one thing: register a GitHub OAuth app and prove the provider flow works. Setting
`NEXT_PUBLIC_OAUTH_PROVIDERS=github` rendered the provider button for the first time — by anyone,
ever — and it read, literally, `login.continueWith`.

```
messages/en.json:31       "continueWith": "Continue with {provider}"
login/page.tsx:38         continueWith: t('continueWith'),                        ← no values
login/sign-in-form.tsx:76 labels.continueWith.replace('{provider}', provider)
```

next-intl will not format a message with an unfilled ICU placeholder; it returns the key path. The
`.replace()` that was meant to fill the placeholder then ran against a string that no longer
contained one, and the key path reached the screen.

**Fixed** by formatting on the server, once per provider — `t('continueWith', { provider })` inside
the map — rather than by reaching for `t.raw()` and keeping the `.replace()`. Both make the button
read correctly today. Only one keeps ICU doing the work, which is the whole reason the message has a
placeholder instead of a concatenation, and it is the difference that a second locale finds out
about rather than a reviewer.

**The gate gap, which matters more than the bug.** `scripts/check-locale.mjs` ran three structural
checks: key parity across locales, every `t('key')` resolves, every key is used. `t('continueWith')`
**passes all three** — the key exists, it is used, and there is one locale. Nothing asked whether a
message's placeholders were satisfied by its call site, though that is decidable from the two inputs
the gate already parses.

That is F-62's shape again: **the gate checked that the link exists, not that it works.** A fourth
rule now runs — a message with ICU arguments must be called with them — with mutation proofs, and it
reproduces this exact defect against the real repository when the fix is reverted. Four of the five
ICU messages in `en.json` were already called correctly; the rule flags exactly the one that was not.

Writing it produced two smaller findings of its own, both kept because both were real. The rule
first missed `{ provider }` — object shorthand — which is to say it failed against the very call
site it was written for. And its own docblock, which quotes `t('continueWith', { provider })` to
explain the rule, was scraped by check 2 as a use of a key that does not exist: the extractors read
comments. Both are fixed and tested.

**The finding under the finding.** SPEC-004 is `done`, and this shipped on its sign-in surface. It
survived because the composition had never executed: `NEXT_PUBLIC_OAUTH_PROVIDERS` is empty by
default, `enabledOAuthProviders` returns `[]`, and `providers.map()` rendered nothing — in
development, in CI, and in every test. Every part was built, typed and reviewed. The assembly had
literally never run.

The default is not the mistake. "A provider button that always fails because no client id exists is
worse than no button" is correct, and it should stay. But **the right default is what made the
defect unobservable**, and the answer to that is not to change the default — it is to render the
surface somewhere that is not production. `sign-in-form.dom.test.tsx` now mounts the form with
`providers={['github']}` and asserts that no button's accessible name looks like a key path. It
costs eleven lines and it catches this outright.

## F-65 · The whole app stopped hydrating in development, and the only symptom was one dead button — the second time this project has paid for it

**2026-09-09 · found while closing DEF-018 · fixed**

Reported as "the provider button does not respond to clicks". Reading the code found nothing: the
component has `'use client'`, the button is `type="button"` with an `onClick`, and the action it
calls exists. The code was correct. **React was never hydrating** — not on the login page, and not
on any page.

```
providerFiber: []        ← no __reactFiber$ on the button
bodyFiber:     []        ← none on <body> either
renderers:     0         ← React never mounted a renderer
(no page errors, every JS chunk 200)
```

The cause was one line in the dev-server log that the browser never shows:

```
⚠ Blocked cross-origin request to Next.js dev resource /_next/hmr from "127.0.0.1".
```

`next dev` serves its HMR socket and client runtime only to the origin it advertises — `localhost` —
and treats `127.0.0.1` as a different origin. The page still arrives fully server-rendered and
correct. It simply never comes alive.

**Why it looked like one button.** Nothing throws, and the console shows only a failed WebSocket. The
email form kept working the entire time, because a Server Action form **posts natively without
JavaScript** — progressive enhancement doing exactly its job, and thereby hiding that JavaScript was
dead. The provider button is the only control on that page that needs hydration, so an app-wide
failure presented as a single unresponsive button. Verified against a production build, which
hydrates normally: this is development-only, which is worse than it sounds, because development is
where the defect is supposed to be found.

**This is keelblock's problem, not the framework's.** `supabase status` prints
`http://127.0.0.1:54721`, the OAuth redirect URIs are registered against that host, and the
getting-started page uses it throughout. **Following our own instructions is what breaks
development.**

**Fixed** with `allowedDevOrigins: ['127.0.0.1', 'localhost']` in `next.config.ts`. After it:
`[HMR] connected`, `__reactFiber$` present, zero blocked-origin lines, and the button drives the
real flow to GitHub from a click rather than from a URL pasted into the address bar.

**The part worth keeping.** This was not the first sighting. `docs/TESTING.md` already records a
trial losing an afternoon to a form that submitted and changed nothing, with the cause named
exactly — _"hydration was blocked because it served on `127.0.0.1` rather than `localhost`"_ — and
found _"only by reading the dev-server log"_. It was written down as a story about how that trial
went, and not as a fix, a rule, or a line of configuration. So it happened again, to the owner, on a
different button, and cost the diagnosis a second time.

A project whose stated position is that **a rule with no gate is not a rule** had written this one
down in prose and left it there. `src/dev-origins.test.mts` is the gate: every host keelblock's own
setup instructions hand a reader must be an allowed dev origin. The general shape is that **an
observation recorded as narrative is not a fix**, and a findings document is only worth its cost when
something in the build can fail because of what it says.

## F-66 · Gates that could not tell documentation from instruction — and one that had already bent its own prose to avoid a second one

**2026-09-09 · found by probing the defect F-64 produced against itself · four fixed, one recorded and left alone**

F-64's fix produced a false positive on its own docblock: a comment written to EXPLAIN the new
locale rule quoted a `t('key')` call as its example, and check 2 reported a use of a key that does
not exist. The extractor was reading the file rather than the code. That was fixed in place, and the
obvious question — **which other gates do this?** — was asked and not answered.

Answered here, by probing each gate with a realistic piece of documentation rather than by reading
for the flaw. The test is the same shape in every case: put the thing the gate looks for inside a
comment or a fenced block, where it is plainly a picture and not an instruction, and see whether the
gate reacts.

| gate                                  | probe                                                        | before                 |
| ------------------------------------- | ------------------------------------------------------------ | ---------------------- |
| `check-locale` · `findRawLinkImports` | ADR-010 taught by quoting the import it forbids              | **reported**           |
| `check-deferrals`                     | a docblock explaining the `TODO`/`FIXME`/`@defer` convention | **reported ×2**        |
| `check-contracts`                     | a spec showing the AC table format in a fence                | **reported**           |
| `check-promises`                      | `PRODUCT.md` showing the acceptance-bar format in a fence    | **reported**           |
| `check-content`                       | `FAQ.md` showing how to cite an answer, in a fence           | **reported**           |
| `check-boundaries`                    | the admin import and `'use cache'` quoted in a docblock      | silent                 |
| `check-policies`                      | —                                                            | silent by construction |

`check-research`, `check-freshness` and `check-generated` read JSON and generated artifacts. They
have no prose to misread, which is not immunity so much as never having been exposed.

**The two that were silent are the finding's better half**, because neither is careful — both read
something already structured and never see text at all. `check-boundaries` resolves the import graph
through the TypeScript AST. `check-policies` reads TAP output rather than the `.sql` files and says
why in as many words: _"a commented-out assertion is still in the source"_.

**And that same sentence contains the sharpest thing here.** It goes on to explain why the rule
refuses to enumerate the two TAP directive spellings: doing so _"would put a debt-marker word in a
file the deferral linter reads"_. Somebody hit the `check-deferrals` false positive, understood it
exactly, **steered their prose around it, and recorded the workaround instead of the defect.** The
gate's own header already admits it "cannot scan itself" and calls that "a real blind spot". Both
notes are correct, both are adjacent to the defect, and neither is a finding or a failing test — the
F-65 shape, one document over.

**Fixed** for the four where stripping is unambiguous, via two shared, position-preserving helpers in
`scripts/prose.mjs`. Nothing real ever lives inside a fence or a comment for these rules — an import
in a comment does not execute, an AC row in a fence is not a criterion — so there is no true positive
to lose, and each fix is pinned in both directions: the documentation passes, and a real violation
still fails **on the same line number it did before**.

`stripComments` uses the compiler's scanner rather than a regular expression, and the mutation proof
says why: the obvious `/\/\*[\s\S]*?\*\//` treats the `'/*'` inside a string literal as a comment
opening and blanks real code to the next `*/`. That trades a loud false positive for a silent false
negative, which is the one direction a gate must never fail in — and it is how this fix could have
been worse than the defect.

**`check-deferrals` is deliberately NOT fixed**, and the reason is the point. Its markers _live_ in
comments — that is what a debt marker is — so stripping them would blind it completely, and the only
alternative, narrowing the matcher so prose escapes, buys a quiet gate at the price of a missed
`TODO`. For a debt linter, loud and wrong is the safer failure. Worth knowing before deciding: **the
repository currently contains zero markers**, so this rule has never had a true positive to protect,
and its only measured effect so far is one false positive and one author writing around it.

**One gate goes the other way on purpose, and it is right to.** `status.mjs` scans fenced blocks for
stale counts precisely BECAUSE they are display: its worst instance was a fenced `npm run check`
transcript in the README, and _"a reader acts on a transcript exactly as on a sentence"_. It strips
inline code spans instead, so that a finding about a stale count can quote one. That is the inverse
call to the one made here, in the same repository, and both are correct — which means the rule is not
"strip fences" but **ask whether this rule's subject can do harm from inside a picture**. A wrong
count in a transcript misleads a reader. An example AC row in a fence misleads nobody.

That distinction was tested rather than assumed: writing this entry tripped `status` on the phrase it
originally opened with, a count of gates. The available dodge was to wrap the number in backticks,
which `claimsIn` exempts — and taking it would have been the `check-policies` move exactly: steering
the prose around a gate instead of answering it. The sentence was rewritten to stop asserting a count.

The general shape: **a gate is a reader, and a reader that cannot tell a quotation from a statement
will eventually correct the dictionary.** Most of these were reporting on the documentation that
explains them, which means the cost of documenting a rule was a failing build — the exact incentive
that leaves rules undocumented.

## F-67 · Adopting shadcn silently killed dark mode, and the ADR that measured dark mode working had no way to notice

**2026-09-10 · found while executing the shadcn adoption · fixed**

ADR-018 decided the colour scheme follows the operating system and there is no toggle. It is a good
ADR: it measured before deciding, recorded **36 `dark:` variants across 13 component files**, and
refused two alternatives with reasons rather than postponing them.

`npx shadcn init` rewrote `globals.css` and replaced the OS-keyed dark mode with shadcn's default:

```
@custom-variant dark (&:is(.dark *));
.dark { --background: … }
```

A **class** — set by a theme toggle shadcn assumes the project has, and which ADR-018 explicitly
refused. Nothing in this repository sets `.dark`. Verified after the install: 36 `dark:` usages
across 13 files, and zero occurrences of anything setting that class. **Every one of them was dead.**

**The failure is silent in every layer that exists.** A variant that never matches is not an error.
The CSS compiled. `next build` passed. `typecheck` passed. All 575 tests passed. The page rendered —
in the light palette, on a machine set to dark. There is no console warning, no screenshot diff, and
no gate. The only artifact that would have caught it is a human looking at the page in dark mode.

**Fixed** by keying the variant on the operating system and hanging the dark palette off a media
query instead of a class. The tokens inside are upstream's and are untouched; only the selector they
hang from is ours, which is the right layer to diverge in — the theme belongs to the project, the
components stay CLI-replaceable (ADR-023).

Proven from the compiled stylesheet rather than from the source, because the source is what was
already believed to be right: the build now emits
`@media (prefers-color-scheme:dark){.dark\:border-white\/15{…}}` for the variants and the same query
for the `:root` palette, with **no `.dark` ancestor selector anywhere** in the output.

**The part that outlives this bug.** ADR-018 is exactly the kind of entry the last review asked about
— _"if this recurred tomorrow, what goes red?"_ The answer was **nothing**. It recorded a measured
behaviour, wrote the number down, and left the number as the only thing standing between the decision
and any CLI that rewrites a stylesheet. `src/theme.test.mts` is the mechanism it never had, and it
asserts the _mechanism_ rather than the appearance, because the CLI will overwrite that line again on
the next theme-touching `add`.

That question was raised as a sweep nobody had sized. It found its first casualty within one session
of being asked, without the sweep being run — which is the argument for running it.

**One more instance, in the fix itself.** `theme.test.mts` forbids the string `&:is(.dark *)`, and
the stylesheet comment written to explain _why that string is refused_ quotes it — so the rule failed
on the comment defending it. That is **F-66's exact shape, in a third medium, in the commit that
fixed the other two**: the shared helpers covered TypeScript comments and markdown fences, not CSS.
`stripCssComments` closes it. The lesson is not "add a third stripper" — it is that a text-matching
rule needs one **on the day it is written**, because the first person to document the rule is the
first person to break it.

## F-68 · Five knip exemptions had outlived the expiry written in their own row, and knip had been saying so on every run

**2026-09-10 · found while adding two exemptions for shadcn · fixed**

`knip.reasons.md` is a good document. Every exemption carries a **"Removed when"** column, its header
states that _"an exemption with no expiry is how dead code becomes permanent while looking
supervised"_, and a shrink-only ratchet asserts the list matches `knip.json` and never grows.

Adding the two exemptions ADR-023 needs meant hitting that ratchet, which is the ratchet working.
Looking for something to remove found five entries already past their own stated expiry:

| exemption                                             | removed when it said         | actual state                              |
| ----------------------------------------------------- | ---------------------------- | ----------------------------------------- |
| `@supabase/ssr`, `@supabase/supabase-js`              | SPEC-004                     | SPEC-004 is `done`                        |
| `server-only`                                         | "never — it is load-bearing" | the _package_ is; the _exemption_ was not |
| `@testing-library/react`, `@testing-library/jest-dom` | the first `.dom.test.tsx`    | two exist                                 |

**knip had been printing the answer on every single run.** Under _Configuration hints_:
`@supabase/ssr  knip.json  Remove from ignoreDependencies`, once per stale entry. The gate exited 0,
so the output was never read — green output does not get read, which is most of why this is worth
writing down.

**The ratchet could not have caught it.** It caps how many exemptions exist; it says nothing about
whether any individual one still earns its place. A count is not coverage — F-60 and F-62 are the
same sentence about different documents.

**Fixed**: the five are gone, the two shadcn entries are added and justified, and the ratchet is
tightened 13 → 10. Tightening is the point — a ceiling left where it was set records the high-water
mark rather than the current state.

**And the mechanism**: the `unused` gate no longer runs `knip` directly. `scripts/check-unused.mjs`
wraps it and fails on any `Remove from …` hint, so the tool's own answer to "is this exemption still
needed?" stops being advisory. Structural hints are deliberately not failures — `.css` reporting that
compiled extensions are not followed is a fact about knip, not a stale row, and failing on it would
be a gate nobody can satisfy.

The general shape: **a tool that reports in two channels will be believed in only one of them.**
knip's exit code was load-bearing and its stdout was decoration, and the decoration was where the
answer had been sitting for weeks.

## F-69 · The site keelblock is about to build has no owning spec, and the gate that routes its content proves only that a destination was named

**2026-09-10 · found by being told the wrong home for the proof page · recorded, not fixed**

The proof page — the rendered access matrix, the one artifact no competitor in this field can
publish — was handed to me as "scope inside SPEC-009". `docs/WEBSITE-AND-DOCS.md` had already
written down why that is wrong, in the file describing the work:

> **No spec claims this document.** SPEC-009 (marketing shell) and SPEC-012 (docs) are both about
> what a BUYER receives, carrying bars B-8 and B-5. keelblock.dev itself — this site, this blog, the
> published access matrix, the seven sections below — has no owning spec and no acceptance criteria.
> **It is a plan, and plans are not gated.**

SPEC-009 is the buyer's marketing shell. keelblock.dev is keelblock's own site. Folding one into the
other would have put an ungated artifact inside a spec that means something else, and the section
this page belongs in is already specified better than the instruction was: _"The proof — the live
access matrix, rendered. The 'different organization' column is the whole pitch. Link to the CI run
that produced it."_

**The second gap is the interesting one**, and the same document states it:

> `check-content` enforces that every finding HAS a destination; nothing enforces that the
> destination exists, **so it will keep passing indefinitely while nothing is published.**

Verified: the gate validates that each finding's `to` names a known kind and that the manifest and
`FINDINGS.md` agree in both directions. It then reports how many findings are routed, and to where.
**Not one of them has been published anywhere.** The count is accurate and the sentence it forms is
false — F-60 and F-62's shape a third time, and this one will read as coverage for as long as the
site does not exist.

Writing that paragraph tripped the `status` gate, which is worth leaving in: the first draft quoted
the routing totals, and the rows added by this same commit made that quote stale before it was
committed. The dodge was available — `claimsIn` exempts inline code spans, so backticks would have
silenced it — and taking it would have been the `check-policies` move from F-66 again. The sentence
stopped asserting a number instead.

**Recorded rather than fixed, and the reason is a rule this project already set.** The obvious gate —
every finding routed to `blog` has a post — fails on every such row the day it lands, and ADR-023
said a gate that cannot pass when it arrives is a gate that gets exempted. The weaker version that passes
today (_if a destination directory exists, everything routed to it must be there_) is vacuous until
publishing starts, and a rule that is green because it ran nothing is F-13.

So the fix is not a gate. **It is a spec claiming this document**, which would give the site
acceptance criteria and make the destination question answerable by something other than prose. That
is the next deliverable, and it is what decision B actually needs.

**The sweep's third instance this session.** Both gaps were written down, correctly and in advance,
by whoever wrote the plan — and neither can fail a build. ADR-018 was the first (F-67), the
`check-policies` workaround the second (F-66). The pattern is not that this project fails to notice
things. It is that **noticing is where the work stops**, and a document that names its own gap reads
as diligence right up until the gap costs something.

## F-70 · An open redirect in the auth callback, an application rendering in the browser default serif, and environment validation that ran in no process — none of which twelve green gates could see

**2026-09-10 · found by a genuinely external review · all three fixed**

A second review, commissioned by the owner and conducted without access to these sessions, reported
defects in shipped code. Three were re-derived by execution before anything was changed. All three
reproduced exactly.

### The open redirect

`safeNext` is the function that decides where the auth callback sends a browser, and the callback is
reached by clicking a link in an email — a phishing primitive with keelblock's own domain in front
of it.

```
"/..//evil.example"     -> "//evil.example"    resolves to https://evil.example
".//evil.example"       -> "//evil.example"    resolves to https://evil.example
"/..//..//evil.example" -> "//evil.example"    resolves to https://evil.example
"/..//evil.example/x"   -> "//evil.example/x"  resolves to https://evil.example
```

**The origin check was not wrong; it was asked of the wrong thing.** `new URL('/..//evil.example',
origin)` normalises the `/..` away and leaves `pathname === '//evil.example'`, so the input really
did resolve on-origin and the check really did pass. The defect was the **return value** — a
protocol-relative pathname, which the caller re-resolves against the real origin, where
`//evil.example` is a host and not a path.

The file's own docblock had already written the fix: _"resolve it and check the origin, rather than
pattern-matching for known-bad shapes. A blocklist … is a list of the payloads someone thought of;
this asks the question the browser will ask."_ That reasoning was right and had been applied to the
input only. Adding `startsWith('//')` would also work and would contradict the rule two paragraphs
above it. **Applying the rule to the output is the rule executed rather than amended.**

The old test is the finding in miniature. It ended with `INVARIANT: whatever comes back cannot leave
the origin it is resolved against`, under a comment reading _"stated as one property rather than a
list of known payloads, because a list is always the set someone thought of"_ — and then iterated a
list of eight. A generated property test over every combination of URL metacharacters up to four
fragments finds **251 escaping inputs** against the old function. The reported four were a sample.

### The serif

Every page rendered in the browser's default serif, and **this one is mine**: `deded68` ran
`shadcn init`, which overwrote `--font-sans: var(--font-geist-sans)` with `--font-sans:
var(--font-sans)`. A custom property defined as itself is an invalid cycle; the declaration is
dropped and the element falls back. In the same session I noticed the adjacent smell — `body {
font-family: Arial }` — wrote that "the token work will resolve it", and did not look again.

**The reported one-line fix was necessary and not sufficient**, which only came out by rendering the
page. With the token corrected the built CSS read `--font-sans:var(--font-geist-sans)` and the
browser still reported `Times`: `next/font` was defining `--font-geist-sans` on `<body>`, while
`globals.css` applies `font-sans` to `html`, one level **up**, where the property is not in scope.
Out-of-scope is not an error either — the declaration is simply dropped. The variables now sit on
`<html>`, alongside every other token in the project, all of which were already on `:root`.

**Nothing in this repository could have noticed.** The CSS is syntactically valid, so it compiles;
`next build` passes, `typecheck` passes, 594 tests pass, and the font Next loads is still fetched and
still applied — so even the network tab looks right. The only instrument that catches a page being in
Times New Roman is a person looking at it, which is the second review's Theme 4 stated as a fact
about this repository rather than as an opinion.

### The validation that never ran

`src/lib/env.ts` promises that importing it "validates and throws — so a misconfigured deployment
fails at boot with every problem listed". Measured: its only importer is
`src/lib/supabase/server-only/admin.ts`, and the only things naming `createAdminClient` are **fixture
strings inside `scripts/check-boundaries.test.mts`**. `export const env = load()` executed in no
process. Two claims in this very document — that keelblock "refuses at boot" a credential-shaped
`NEXT_PUBLIC_` variable, and that a bad enum is "a boot error" — were false for the life of the
module.

A correct validator that nothing invokes is indistinguishable, from outside, from no validator.
`src/instrumentation.ts` calls it in `register()`, the one hook Next runs once per server instance
before any request. Verified by booting with `NEXT_PUBLIC_SUPABASE_URL="not-a-url"`: the server now
refuses to start and lists the problem.

**And that fix expired an exemption within the minute.** `src/lib/env.ts` was exempted in
`knip.reasons.md` as "one import away from live, and it already validates on every server boot **once
anything imports it**". The qualifier was the finding, sitting in the exemption table the whole time.
The `unused` gate added hours earlier (F-68) reported the expiry on the next run; the ratchet is
tightened 10 → 9.

### What the three have in common

Each was invisible to every gate for the same reason, and it is not that the gates are weak. **Every
gate asks whether a claim is true. None asks whether the product works.** An open redirect is a
correct function with the wrong argument; a serif page is valid CSS; a validator nobody calls is a
passing unit test. Twelve green gates, 594 passing tests, and the front door did not open.

That is the second review's Theme 3 — "no gate can fail because the project is spending too much on
itself" — and Theme 4, "nobody has tried to use it". The measurement offered with them is 20.2% of
commits touching `src/` and a 3.87:1 ratio of gate code to application code. This entry does not
resolve that, and it should not: three fixes are not an answer to a structural finding. It records
that the finding arrived with evidence and that the evidence reproduced.

## F-72 · `npm run verify` would have run `supabase db reset` against the developer's own database, while printing "executed exactly as CI will"

**2026-09-10 · reported by the external review, reproduced here · fixed**

`verify.mjs` parses `check.yml` and executes its steps, which is the right design — a hand-written
local mimic drifts from the workflow the first time either changes. It ignored one key:

```
check.yml:188   - name: the buyer's stack, at their own schema
check.yml:189     working-directory: /tmp/scaffold
check.yml:190     run: supabase start && supabase db reset
```

`planStep` returned `cmd: ['bash', '-c', step.run]` with **no `cwd`**, and the runner spawned it
without one. In CI that step runs inside a throwaway scaffolded project. Locally it would have run
in the repository root, against the developer's own Supabase instance, dropping and recreating every
table — and the summary line for it reads _"ran — executed exactly as CI will"_.

Verified without running it, by planning the real workflow's steps and printing what would be
spawned and where: `bash -c "supabase start && supabase db reset"` with `cwd` = the repository root.
`verify.mjs` iterates every job, so the `upgrade` job is reached.

**A fidelity claim that is wrong in the destructive direction is worse than no fidelity claim.**
Every other honesty mechanism in that file is careful — four states, skips named with reasons, a
printed percentage of steps genuinely executed — and the number counted a step that would have run
in the wrong place as faithful.

**Fixed** by carrying `working-directory` into `cwd`, and by reporting the step as `skipped` with its
reason when the directory does not exist locally, which is this file's own fourth state rather than
a new concept. `supabase db reset` is also added to `HEAVY`, whose stated purpose — "slow **or
destructive** locally" — had no destructive entry.

The test that matters is neither of those: it plans every step of the **real** workflow and asserts
that nothing destructive resolves to this repository's own directory. A fixture would have been
right while the workflow was wrong, which is how this got here.

## F-73 · The invitation journey dead-ended, because the only thing not wired for it was the screen

**2026-09-10 · reported by the external review, reproduced here · fixed and walked in a browser**

`invite/[token]/page.tsx:52` sends a signed-out invitee to `/login?next=/invite/<token>`. Both
server actions were already built for that value — `requestMagicLink` reads a `next` field off its
FormData, `startOAuth` takes a `next` argument — and **the login page never read the parameter, the
form never submitted it, and the button called `startOAuth(id)` with one argument.** So accepting an
invitation while signed out landed on the home page with the invitation abandoned.

Every part was correct. The composition was missing, which is defect family A again and the same
shape as F-64: components proven, assembly unrun. This one is worse than the button, because the
assembly here is a _journey_ — the thing a person is trying to do — and a journey has no test that
fails when one link in it is missing unless someone walks it.

**Fixed** in three places, all of which existed to be used: the page reads `searchParams.next`, the
form submits it as a hidden field, and the provider button passes it as the argument the action
already accepted. Both paths, deliberately — **a journey that survives one and not the other fails
half the time**, and the email path and the provider path are equally likely.

The value is sanitised at the page as well as in the actions, and the duplication is the point: the
action's check protects the redirect, and this one keeps attacker-controlled text out of the rendered
document. Confirmed in a browser — `?next=/invite/abc123` reaches the hidden field and the POST body,
and `?next=//evil.example` arrives in the DOM as `/`.

Walked rather than asserted, on the review's instruction and F-70's evidence: a passing test proves
less than usual for a journey, and the last three defects all passed every test in the repository.

## F-74 · The headline command crashed, and the two defects behind it only appeared one at a time, by running it

**2026-09-10 · reported by the external review, reproduced here · fixed**

`npx create-keelblock-app myapp` is B-1's headline command and the single sentence a new user is
most likely to type. It built:

```
git clone --depth 1 --branch HEAD https://github.com/itecbrains-source/keelblock.git <tmp>
fatal: Remote branch HEAD not found in upstream origin
```

`--branch` takes a branch or a tag. `HEAD` is neither. With no `--ref` the script defaulted the ref
to the string `'HEAD'` and handed it to the one git subcommand that does not accept it.

**Then it happened again, one layer down.** With the clone fixed, the same run died on
`fatal: Not a valid object name null` — `git ls-tree -r --name-only null`, because "no ref" had been
made `null` and two more call sites still passed it through. **That second defect was invisible
until the first was fixed and the command was run again**, which is the review's Theme 4 as a
mechanic rather than a slogan: reading found one of these, running found both.

**And a third, from asserting rather than looking.** The end-to-end test checks that excluded paths
are absent, and `docs/review/` was still there — empty. `tar -x` creates a directory for every
archived file, the drop pass removes files, and nothing removed the directory. Every generated
project shipped an empty `docs/review/` folder: a thing that says something used to be here, in a
project whose entire premise is that it is the buyer's from the first commit.

**Why CI could not catch any of it.** The `scaffold` job runs
`create-keelblock-app /tmp/app --from "$GITHUB_WORKSPACE" --ref "$GITHUB_SHA"`. A ref is always
supplied, so `ref` is never `null` there — **the default invocation is the one combination CI never
exercises**, and it is the only one a user types. The review's note is the durable part: every defect
in this file lives in the ~90 lines of `main()` that no test executes.

**Fixed**, and the fixes are the boring half:

- `cloneArgs(ref, url, dest)` is extracted and pure, so the line the default path dies on can be
  executed by a test at all. No ref means **no `--branch`**, which is not a fallback but the correct
  instruction: a clone with no branch takes the remote's own default.
- `ls-tree` and `archive` both take the **resolved commit** rather than the ref. That also makes the
  comment above them literally true instead of true by luck — the listing and the snapshot can no
  longer be different commits.
- The provenance file records the resolved commit when no ref was named, because `HEAD` in a
  provenance file is a pointer that means something else tomorrow, and `upgrade.mjs` is handed that
  value to upgrade _from_.
- `main()` has a handler. It had none, so the first thing a new user runs failed as an
  `execFileSync` stack trace. It now prints the failure, the command that lists valid refs, and the
  local-checkout escape hatch — with the stack still available under `--debug`.
- Directories left empty by exclusions are pruned, deepest first.

The test that matters scaffolds **from a local checkout with no `--ref`** — the exact combination CI
does not run — and asserts the exit status, a 40-character resolved commit in the provenance, and the
absence of both excluded paths. It fails against every one of the three defects above.

## F-75 · The relabel that corrected an overclaim missed the file a new reader opens first

**2026-09-10 · found by the review seat, on its own documents · fixed**

`docs/review/` was labelled an "external review". It is a session the owner ran, and DEF-020 already
draws that line — _"a session the author spawned is not one"_. The label was corrected in
`README.md` and **missed `HANDOVER.md`**, which is the file a new reader opens to understand the
folder, and `ADR-015`, which opens with "An external review found…".

So for one commit the folder contained a correction and a contradiction of it, two files apart. That
is F-60's class — a reader-facing claim the repository has already refuted elsewhere — occurring
**inside the fix for itself**, which is why this is a rule now rather than a third correction.
`review-records.test.mts` fails if any reader-facing document describes `docs/review/` as external,
and it reports the exact file and line. Its own docblock says "external review" twice, so it strips
comments and fences on the day it was written, per AGENTS.md.

ADR-015's substance is untouched: `keel` being unavailable was verified against the npm registry and
RDAP, not taken from the review's word. Only the label was wrong.

## F-76 · The nightly had been red for a day, and the job that would have told anyone had never once executed its own purpose

**2026-09-10 · found by the lens seat · fixed**

Two defects in `nightly.yml`, in different jobs, both invisible to every gate because **no gate reads
CI state**. `PRODUCT.md` claims the proof runs "every push and every night"; the live badge read
`failing`; and `npm run check` and `npm run status` cannot see either.

### The clean-clone job, red since 2026-09-09

The review rule verifies that each record names a commit that **exists**, and `actions/checkout`
fetches one commit by default. Reproduced by isolation rather than inferred — a shallow clone of this
repository fails, a full clone passes:

```
git clone --depth 1 file://<repo> shallow && node scripts/check-promises.mjs
  [review] the repository history is shallow, so no record's commit can be verified.
  Set `fetch-depth: 0` on the checkout step for any job that runs this gate.
```

**The gate names its own fix in its error text.** That fix was applied to `check.yml`, with a comment
citing run 34261942642 — the run that taught it — and not applied to `nightly.yml`. A lesson recorded
in one file and not the other, which is F-75's shape one layer up.

### The range-drift job, which has never run its own reason for existing

`nightly.yml` ran `npx tsc --noEmit` with no `next typegen`. `.next/` is gitignored, so `PageProps`
— which lives in `.next/types/routes.d.ts` — does not exist on a clean checkout:

```
git archive HEAD | tar -x -C drift && npx tsc --noEmit
  src/app/[locale]/login/page.tsx(23,55): error TS2304: Cannot find name 'PageProps'.
npx next typegen && npx tsc --noEmit   -> exit 0
```

A failed step halts the job, so **`npm test` — the step that IS the job's purpose — never ran once**.
And `continue-on-error: true` meant the workflow stayed green while its only detector reported a
permanent false positive. The job existed to answer "does the new dependency resolution still
behave"; it has never asked.

The lens ran the real thing in a clean clone: `next typegen && tsc` clean, 610/610 tests pass. **There
was no drift.** A detector reporting a constant false failure over a genuinely clean signal is worse
than no detector, because the noise is indistinguishable from the answer.

`continue-on-error` is left in place: its recorded reasoning — "a range moving under us is news, not
a broken build, and a nightly that cries wolf about somebody else's release gets muted within a week"
— is sound, and now that the job actually runs, whether it should be able to fail is a real decision
with real data rather than a guess. **Named as open rather than resolved quietly.**

### The gate that should have caught both

`check-workflow.test.mts` read two files and mostly one job of one of them. `deploy.yml` — the only
workflow holding a production credential — was read by **no gate at all**, and appeared in `scripts/`
only inside the scaffolder's exclusion list. It ran plain `npm ci` with `VERCEL_TOKEN` in the
environment, while `check.yml` and `nightly.yml` used `--ignore-scripts` at all three of their
install sites. The rule was known, applied everywhere it did not matter most, and ungated.

Now the rules that are universal enumerate the workflow directory instead of naming files: every
install disables lifecycle scripts, and every job that runs the review gate against **this**
repository checks out full history. Both carry mutation proofs.

The second rule immediately reported `check.yml:scaffold`, which is a **true exemption**: that job
runs `npm run check` inside a generated project, where `isGeneratedProject()` short-circuits the
review block before it reaches the history guard. It is exempted by that mechanism rather than by
name — a rule narrowed by a list of exceptions stops being a rule.

## F-77 · The rule written to stop a label recurring had three blind spots, and its docblock claimed a mitigation it was not applying

**2026-09-10 · found by the lens seat, on the rule from F-75 · fixed**

F-75 added a rule so the "external review" relabel could not be missed a third time. It shipped with
one `it()`, no mutation proof — in a repository whose B-4 reads "every gate has a proof it can fail"
— and the lens wrote four probes against it. Two passed that should have failed:

- **A date exempted anything.** The exemption was `/…|2026-09-10/i`, and **dating the folder is the
  most natural sentence anyone would write about it**. `docs/review is an external review, dated
2026-09-10` was exempt. Now naming the folder on a line is decisive and no date rescues it.
- **The file list was typed by hand.** Five files; ten markdown files mention `docs/review`; eight
  went unscanned, including `CONTRIBUTING.md` and `CHANGELOG.md`. **"The relabel missed a file",
  recurring inside the rule written to prevent it**, because the rule enumerated files the same way
  the relabel had. The list is now derived from `git ls-files`.
- **The docblock claimed comments were stripped "per AGENTS.md"** and called `stripFences` and
  `stripCssComments`. The files it scans are **markdown**, whose comment syntax is `<!-- -->`, which
  neither knows about. What actually protected that docblock was an accident of which files the rule
  happened to scan. **A claimed mitigation that does not apply is worse than an absent one**, because
  it stops anyone from looking. `stripHtmlComments` now exists in `prose.mjs` — the fifth medium, and
  AGENTS.md's own instruction is why it lives there rather than being worked around locally.

**And a sixth occurrence, caught before commit.** The widened rule's first run over the whole
repository reported three lines of F-75's own write-up, which quote the old label to explain what was
wrong with it. That is the use/mention distinction this entire defect family is about, so the rule
now makes it mechanical: a phrase inside quotes or backticks is a **mention**, not a use. This is the
first time the class was caught by the mechanism instead of by a person.

Six occurrences now: F-64, F-66, F-67, F-70, this rule's docblock, and this rule's first run. The
AGENTS.md entry added yesterday says a text-matching rule needs a stripper on the day it is written.
It is not enough on its own — **the rule also has to be told what counts as quoting**, and it has to
be pointed at every file rather than a remembered few.
