# Spike results — 2026-09-07

Ran against an isolated `supabase/postgres:17.6.1.141` container on port 55432 (the two live local
Supabase stacks were left untouched). Schema: SPEC-001's shape — `organization`,
`organization_member`, a `SECURITY DEFINER` membership helper, three scoped tables and one global one.

**Everything below is measured, not reasoned.** Seven findings; four change the specs.

---

## F-1 — The generated suite confirms a total cross-tenant leak as green ✅ *(validates SPEC-002)*

Planted a **semantic** defect: `is_org_member(org)` drops its `user_id` check, so every authenticated
user is a "member" of every organisation. Syntactically unremarkable — a plausible typo or a bad merge.

```
user A (member of Org A only): 2 projects visible   ← should be 1. Total cross-tenant read leak.
rlsautotest on `project`:      authenticated, not authorized → SELECT blocked   ← reported CLEAN
```

The only failure it reported was an unrelated table. **This is the whole justification for the intent
layer, demonstrated rather than argued**, and it is reproducible.

The mechanism is stated by the tool itself:

> *"opaque policy function(s) were MOCKED to prove the policy delegates correctly (wiring) — the
> function's own logic is NOT verified here"*

So the boundary is sharper than ADR-005 stated it: **the generated layer verifies the policy's
delegation; every line of logic inside a helper is unverified by it.** Since keel's whole model puts
the membership predicate in exactly such a helper, the intent layer is not a nice-to-have — it is the
*only* thing testing the predicate at all.

**Correction to SPEC-002 AC-4:** the planted defect must be semantic. A *syntactic* one is caught —
`with check (true)` was flagged as a footgun. AC-4 as drafted would have failed for the wrong reason.

## F-2 — `postgres` has `BYPASSRLS`, and `FORCE ROW LEVEL SECURITY` does not stop it 🔴 *(new REQs)*

```
rolname   | rolsuper | rolbypassrls
postgres  | f        | t
```

Measured with FORCE enabled on `project`: **postgres read all 2 rows across both organisations.**

Two consequences, neither of which is in any spec:

1. **`FORCE` is not the mitigation it appears to be.** rlsautotest's own advice — *"the owner is not a
   superuser, so the owner bypasses this table's RLS. Add: ALTER TABLE … FORCE ROW LEVEL SECURITY"* —
   is **incomplete on Supabase**, where the owner bypasses via `BYPASSRLS` rather than ownership.
   Adding FORCE changes nothing. *Do not adopt a tool's remediation advice without testing it.*
2. **Any `SECURITY DEFINER` function owned by `postgres` runs with RLS bypassed.** The membership
   helper works *because of* this, not despite it. Which means such a function returning rows rather
   than a boolean is a total isolation bypass with no policy involved — and it would be invisible to
   every layer of SPEC-002.

→ SPEC-001 needs: definer helpers return scalars only, never rows; a gate over definer functions
reachable by `authenticated`; and the `BYPASSRLS` role inventory as a reviewed artifact.

## F-3 — A cross-tenant write is invisible to the attacker 🔴 *(strengthens SPEC-001 REQ-4)*

With `with check (true)`, user A inserted a row into Org B — and then still saw only their own row.
The smuggled row is invisible to the person who wrote it.

**A suite that proves isolation by reading can never detect this.** Only a test that attempts a
cross-tenant *write* and asserts rejection does. This is why REQ-4 is its own requirement.

## F-4 — `WITH CHECK` detection must catch trivially-true, not just NULL 🔴 *(corrects SPEC-001 REQ-4)*

The defect's policy **has** a `WITH CHECK` — it is `true`. `polwithcheck IS NULL` misses it entirely.
SPEC-001 REQ-4 as written ("every write policy has a `WITH CHECK` clause") passes this defect.

## F-5 — Catalog derivation works cleanly ✅ *(validates SPEC-001 REQ-8, SPEC-003 REQ-2)*

One query over `pg_class`/`pg_attribute`/`pg_policy` derived the scoped set and every violation:

```
audit_note          | no policy at all
document            | write policy "document_insert" has a TRIVIALLY TRUE WITH CHECK
organization_member | RLS is disabled            ← a real mistake I made writing the spike
pricing_tier        | correctly excluded (no organization_id)
```

No false positive on the global table. **It caught an unplanted bug**: I had forgotten RLS on the
membership table — the worst possible hole, since anyone could grant themselves membership anywhere.
The gate caught its own author's mistake within minutes of existing.

## F-6 — `supabase_etl_admin` is `BYPASSRLS` and flagged client-reachable ⚠️ *(needs verification)*

rlsautotest rated this CRITICAL. Whether it is client-reachable on **hosted** Supabase, or an artifact
of this bare container, is **unverified** — and the difference matters. Recorded as an open question,
not a finding.

## F-7 — Tooling notes

- `docker exec` needs `-i` or the heredoc is a **silent no-op** — it cost one inconclusive result
  before being noticed. Use `-v ON_ERROR_STOP=1`.
- rlsautotest's exit code is masked by a pipe. CI must check `PIPESTATUS`, or the CI gate is a check
  that cannot fail.
- Installs clean on Python 3.11 (`pglast`, `psycopg`), runs in seconds, Apache-2.0, v0.7.0.
- Its HTML report is a genuinely usable access matrix — it needs no rebuilding for B-2.

---

## Verdict

**Both spike questions answered, and the plan survives with four corrections.** `rlsautotest` is
adopted as specced. The catalog derivation is sound. The two-layer thesis is now demonstrated rather
than asserted — which is the difference between a claim and evidence, and it is the claim keel exists
to make.
