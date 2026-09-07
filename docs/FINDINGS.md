# Findings

Things keel discovered by **measuring**, not by reasoning. Each was reproduced before it was believed,
and each changed the code or a decision. Dated, with the repro, so a reader can check rather than
trust.

This file is the evidence behind keel's claim. It is also, deliberately, the most useful thing we can
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

Result: a user who belonged to one organisation could read both. The generated suite reported the
affected table **clean**. Its own output explains why:

> *"opaque policy function(s) were MOCKED to prove the policy delegates correctly (wiring) — the
> function's own logic is NOT verified here"*

An exhaustive generated suite verifies that a policy *delegates* to its helper. Every line inside
that helper is unverified by it. Since the membership predicate is exactly such a helper, a
hand-written intent layer is not a nice-to-have — it is the only thing testing the predicate at all.

**A syntactic defect (`with check (true)`) *is* caught.** Only the semantic one slips through, which
is why keel's proof of this uses a wrong helper rather than a suspicious-looking policy.

## F-3 · `FORCE ROW LEVEL SECURITY` does not stop the table owner on Supabase

**2026-09-07 · SPEC-001 REQ-11**

```
rolname  | rolsuper | rolbypassrls
postgres | f        | t
```

Measured with FORCE enabled: `postgres` read every row across every organisation. It bypasses via
`BYPASSRLS`, not via ownership, so FORCE changes nothing — **including the remediation the tooling
itself recommends.**

Consequence: any `SECURITY DEFINER` function owned by `postgres` runs RLS-bypassed. keel's membership
helper works *because of* this. One returning **rows** rather than a scalar would be a total isolation
bypass with no policy involved, invisible to every test layer.

## F-4 · A cross-tenant write is invisible to the attacker

**2026-09-07 · SPEC-001 REQ-4**

With a `WITH CHECK (true)` write policy, a member inserted a row into another organisation — and then
still saw only their own row. The smuggled row is invisible to the person who wrote it.

**A suite that proves isolation by reading can never detect this.** Only one that attempts a
cross-tenant write and asserts rejection does. Relatedly: presence of a `WITH CHECK` is not enough —
the real defect *has* one, it is `true`.

## F-5 · A failing `USING` on `UPDATE` is a silent no-op

**2026-09-07 · shapes every write test in the intent suite**

A member attempting to promote themselves to owner gets `UPDATE 0` — **no error**. Security holds,
silently.

So the privilege-escalation case must be asserted on the *data*. A test expecting an exception fails;
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

*Method note: a spike environment that is nearly the target returns nearly the truth.*

## F-8 · An unconstrained INSERT policy made the access matrix cry wolf

**2026-09-07 · fixed in `20260907140000_organization_creation_rpc.sql`**

The generated matrix flagged `organization` as REACHABLE by a different-organisation user. It was a
**false positive** — the prober created an organisation (permitted by `with check (true)`), became its
owner, and legitimately read its own row.

The diagnosis indicted the schema rather than the tool: `with check (true)` was the only unconstrained
write policy in keel, a spam vector, and the exact shape keel's own gate forbids. Creation moved to a
`SECURITY DEFINER` RPC, so there is no INSERT policy at all and the matrix reads clean.

**A matrix with a false positive in it teaches people to ignore the true ones.**

---

# Found by auditing our own work

The findings above came from building. These came from **deliberately attacking what we had already
shipped and called green.** Two were live security defects. Three were keel breaking its own rules.

That distinction is the point: a green suite means the tests you wrote pass. It says nothing about
the tests you did not think to write.

## F-9 · An admin could demote the owner and seize the organisation

**2026-09-07 · fixed in `20260907150000_membership_invariants.sql`**

```sql
-- as an ADMIN of the organisation
update public.organization_member set role = 'member'
 where user_id = '<the owner>';         -- UPDATE 1
```

The owner became a member. An admin could take over any organisation they administered. The `owner`
role is meaningless if an admin can remove it.

Fixed with a trigger: any row that *is* an owner, or is *becoming* one, may only be touched by an
owner.

## F-10 · The last owner could orphan an organisation

**2026-09-07 · same fix**

```sql
-- as the ONLY owner
delete from public.organization_member where user_id = '<me>';
-- orgs = 1, members = 0
```

An organisation nobody can administer, nobody can delete (delete requires an owner), holding its slug
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
prober resets identity by clearing only the plural form, so a stale identity survives — and keel's
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

## F-13 · keel's own `unit` gate could not fail

**2026-09-07 · the most embarrassing finding here, and the reason it is published**

`npm run check` ran `vitest run --passWithNoTests` against **zero test files**, and reported a green
tick. Meanwhile `render()` — the pure function producing the access matrix, the artifact the whole
claim rests on — had no test at all.

keel's own rule is *every gate ships a proof it can fail*. The gate enforcing that rule did not
have one. Fixed: `--passWithNoTests` removed, and nine tests added of which six are mutation proofs
that restore a real defect and assert the matrix goes loud.

**The rule was written down and still violated.** Writing a standard is not implementing it, and the
only reliable check on that is an audit that assumes the author was wrong.

## F-14 · An unconstrained default privilege we also had to un-claim

**2026-09-07 · corrected in the same migration**

The last-owner invariant was originally documented as holding "on every path — including the service
role." That was theatre: a service-role holder bypasses RLS and can drop the trigger outright.
Enforcing it unconditionally also broke the policy prober's legitimate fixture reset.

Both triggers now constrain **user-initiated** changes and say so. **An overclaimed guarantee is a
worse defect than an absent one**, because people build on it.

---

# Found by reading the competition

## F-15 · In an app-layer model, the other tenant's row is in memory *before* the check runs

**2026-09-07 · from `boxyhq/saas-starter-kit`, and the clearest illustration of why keel exists**

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
2. a *separate function* the route must remember to call compares the tenant

So a foreign tenant's data is already in the process, in memory, in the log if anything logs the
query, before anything decides you were not allowed to see it. **Under RLS the row is never selected
at all** — the predicate is inside the query plan, and there is no step 2 to forget.

This is not a criticism of their engineering. It is the ceiling of the architecture: `grep -r
"create policy"` across their schema and lib returns **zero matches**, and there is no Prisma
`$extends` or middleware applying scope centrally either, so every one of ~50 query sites carries the
obligation individually. Five thousand stars have accumulated on that arrangement, which is the
market telling you the gap is not obvious to buyers.

**Two smaller observations from the same repository**, both of which keel had already decided
differently, and which are worth recording because they were arrived at independently:

- They ship `knip` as `check-unused` — and **their CI does not run it.** The tool exists; nothing
  enforces it. That is the advisory-not-blocking pattern keel rejects by design.
- Their CI has **no secret scanning** at all.
