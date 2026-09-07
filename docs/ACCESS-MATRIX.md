# Access matrix

> **Generated — do not edit.** Regenerate with `npm run access-matrix`.
> Derived from the live policy catalog by probing each table as each identity, so it
> describes what the database *does*, not what anyone believes it does.

Legend: `✓` permitted · `·` denied · `⚠` **behaviour differs from the policy's intent**

- **Unauthenticated** — a visitor with only the publishable key
- **Authenticated · different organisation** — **the row that matters** — a real user of another tenant
- **Authenticated · member** — a member of the organisation that owns the row
- **Service role** — bypasses RLS by design; server-only, never in a browser

## `organization`

Row-level security: **enabled** · policies for DELETE, SELECT, UPDATE

| Identity | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Unauthenticated | · | – | · | · |
| Authenticated · different organisation | · | – | · | · |
| Authenticated · member | ✓ | – | ✓ | – |
| Service role | · | – | · | · |

## `organization_member`

Row-level security: **enabled** · policies for DELETE, INSERT, SELECT, UPDATE

| Identity | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Unauthenticated | · | · | · | · |
| Authenticated · different organisation | · | · | · | · |
| Authenticated · member | ✓ | ✓ | ✓ | ✓ |
| Service role | · | – | · | · |

## `project`

Row-level security: **enabled** · policies for DELETE, INSERT, SELECT, UPDATE

| Identity | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Unauthenticated | · | · | · | · |
| Authenticated · different organisation | · | · | · | · |
| Authenticated · member | ✓ | ✓ | ✓ | ✓ |
| Service role | · | – | · | · |

## Bypass surfaces

Objects and roles that can sidestep RLS **even when every policy above is correct.** Listed
for review, not as failures — each is either sanctioned or a finding.

| Severity | Object | Why it is listed |
|---|---|---|
| HIGH | `create_organization(org_name text, org_slug text)` | SECURITY DEFINER function is EXECUTE-able by authenticated; it runs as its owner and bypasses the caller's RLS; reads/writes RLS-protected organization, organization_member. |
| HIGH | `is_org_member(org uuid)` | SECURITY DEFINER function is EXECUTE-able by authenticated; it runs as its owner and bypasses the caller's RLS; reads/writes RLS-protected organization_member. |
| HIGH | `org_role_of(org uuid)` | SECURITY DEFINER function is EXECUTE-able by authenticated; it runs as its owner and bypasses the caller's RLS; reads/writes RLS-protected organization_member. |
| MEDIUM | `organization` | dual write path: a SECURITY DEFINER rpc (create_organization(org_name text, org_slug text)) writes this table AND authenticated holds a direct INSERT/UPDATE/DELETE grant on it. If the rpc is the intended write path (it holds the validation), the client can skip it and write the table directly -- every RLS assertion still passes. REVOKE the direct DML so the rpc is the only path; the direct-write denial then becomes an assertable boundary. |
| MEDIUM | `organization_member` | dual write path: a SECURITY DEFINER rpc (create_organization(org_name text, org_slug text)) writes this table AND authenticated holds a direct INSERT/UPDATE/DELETE grant on it. If the rpc is the intended write path (it holds the validation), the client can skip it and write the table directly -- every RLS assertion still passes. REVOKE the direct DML so the rpc is the only path; the direct-write denial then becomes an assertable boundary. |
| CRITICAL | `supabase_etl_admin` | role is BYPASSRLS and bypasses RLS but is not a sanctioned bypass role and is client-reachable (login / client role / SET ROLE-able by a client). Confirm it should have this, revoke it, or pass --allow-bypass-role. |

---

**No anomalies.** Every identity reached exactly what its policies intend, on every table and command.
