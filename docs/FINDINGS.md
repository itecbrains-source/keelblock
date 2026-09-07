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
