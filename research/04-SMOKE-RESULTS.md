# Smoke test results — 2026-09-07

Five assumptions that sat under the specs unverified. Four held; **one did not, and it changes an ADR.**
Run in a throwaway worktree with its own Supabase stack on dedicated ports. keel runs its own
isolated stack (`project_id = keel`, ports 547xx) so it never contends with anything else on the
machine — worth knowing if you develop several Supabase projects side by side.

| #   | Assumption                                           | Result                                              |
| --- | ---------------------------------------------------- | --------------------------------------------------- |
| S-1 | Next 16 builds on Node 26                            | ✅ 16.3.4, Turbopack, TS checked, clean             |
| S-2 | A keel stack starts without disturbing the live ones | ✅ 546xx, 22 live containers unaffected             |
| S-3 | **`@supabase/ssr` works with Cache Components**      | ❌ **broke the build — see below**                  |
| S-4 | rlsautotest behaves the same on a real stack         | ✅ plus one new CRITICAL                            |
| S-5 | `supabase test db` runs pgTAP                        | ✅ 2/2, incl. cross-tenant INSERT rejection (42501) |

---

## S-3 — Cache Components break every authenticated page 🔴 _(changes ADR-004)_

ADR-004 turned Cache Components on as though it were free. It is not. With `cacheComponents: true`,
**any Server Component that reads cookies fails the production build** — and every authenticated
Supabase read reads cookies:

```
Error: Route "/": Next.js encountered uncached or runtime data during prerendering.
`cookies()` … accessed outside of <Suspense> prevents the route from being prerendered
```

Next offers three ways out, and for a multi-tenant app **only two are admissible**:

| Route out                      | Verdict                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Wrap the read in `<Suspense>`  | ✅ **the default.** Verified: builds, and the route becomes `◐` — static shell, streamed tenant data |
| `export const instant = false` | ✅ acceptable for a route with nothing meaningful to prerender                                       |
| `"use cache"` on the read      | ⛔ **the cross-tenant leak ADR-004 exists to prevent**                                               |

**Good news, measured:** Next _itself_ refuses the dangerous path —

```
Error: Route /cached used `cookies()` inside "use cache".
Accessing Dynamic data sources inside a cache scope is not supported.
```

So the naive leak is a build error, not a review responsibility. **But the error message hands you the
exact recipe for the real one:** _"use `cookies()` outside of the cached function and pass the required
dynamic data in as an argument."_ That is legitimate and necessary — it is how you cache a per-org
aggregate — and it is also precisely how a tenant leak gets written, if the organisation id is captured
from an outer scope or defaulted rather than passed as an argument that Next keys on.

**Two consequences for the specs:**

1. ADR-004's gate is now **narrower and sharper**. It does not need to police "is the tenant in the
   cache key" across all caching — the framework blocks the naive case. It must check the surviving
   one: a `use cache` function reaching tenant data derives its organisation from an **argument**,
   never from closure or a default.
2. **A standard authenticated page shell becomes an architectural default**, not a style preference:
   every authenticated route ships a `<Suspense>` boundary with a real fallback. This dovetails with
   the honest-states rule — _loading_ stops being an afterthought and becomes a state the framework
   forces you to design.

## S-4 — On a real stack, the membership helper is callable by `anon` 🔴 _(completes SPEC-001 REQ-11)_

The bare container in the earlier spike did not show this. The real stack does:

> `[CRITICAL] is_org_member(org uuid): SECURITY DEFINER function is EXECUTE-able by anon; it runs as
its owner and bypasses the caller's RLS; reads RLS-protected organization_member.`

Cause: Postgres grants `EXECUTE` on new functions to `PUBLIC` by default. So an anonymous caller can
invoke the membership oracle. REQ-11 said definer helpers must return scalars; it did **not** say
`revoke execute … from public, anon`. That is the missing half, and it is the half that would have
shipped.

**Method note worth keeping:** the bare container was cheaper and got four findings, but it did not
model the real grant surface. A spike environment that is _nearly_ the target is a spike that returns
_nearly_ the truth.

## S-5 — the emitted suite lands in the right place

`rlsautotest --supabase --emit .` wrote `supabase/tests/rls/{000-setup-tests-hooks,010-rls-enabled,
101…103-rls-<table>}_rlsautotest.sql` — the layout `supabase test db` already runs. Generated and
hand-written suites coexist with no glue.

---

## Verdict

Smoke testing before building was the right call: **it caught an ADR-level error that would have been
discovered on the first authenticated page and required reworking every route.** Four assumptions held;
the one that did not was the one nobody would have questioned.
