# Access matrix

> **Generated — do not edit.** Regenerate with `npm run access-matrix`.
> Derived from the live policy catalog by probing each table as each identity, so it
> describes what the database *does*, not what anyone believes it does.

Legend: `✓` permitted · `·` denied · `⚠` **behavior differs from the policy's intent**

- **Unauthenticated** — a visitor with only the publishable key
- **Authenticated · different organization** — **the row that matters** — a real user of another tenant
- **Authenticated · member** — a member of the organization that owns the row
- **Service role** — bypasses RLS by design; server-only, never in a browser

## `organization`

Row-level security: **enabled** · policies for DELETE, SELECT, UPDATE

| Identity | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Unauthenticated | · | – | · | · |
| Authenticated · different organization | · | – | · | · |
| Authenticated · member | ✓ | – | ✓ | – |
| Service role | · | – | · | · |

## `organization_member`

Row-level security: **enabled** · policies for DELETE, INSERT, SELECT, UPDATE

| Identity | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Unauthenticated | · | · | ⚠ **REACHABLE** | – |
| Authenticated · different organization | · | · | · | · |
| Authenticated · member | ✓ | ✓ | – | – |
| Service role | ⚠ **REACHABLE** | – | · | · |

## `project`

Row-level security: **enabled** · policies for DELETE, INSERT, SELECT, UPDATE

| Identity | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Unauthenticated | · | · | · | · |
| Authenticated · different organization | · | · | · | · |
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

## Adjudicated

Concerns above that were **examined and accepted**, each with the reason and the date it
was decided. Anything not listed here is unexplained, and unexplained fails the build.

| Concern | Reason |
|---|---|
| `anomaly:organization_member.SELECT.service_role` | FALSE POSITIVE, reproduced 2026-09-08 (F-27). service_role holds NO privilege on this table: `set role service_role; select from public.organization_member` fails with 'permission denied for table'. The prober derives this cell's expectation by matching words in a pgTAP label and renders a failed assertion as REACHABLE, which is a claim about the database its data cannot support. The privilege catalog is authoritative here and says denied. |
| `anomaly:organization_member.UPDATE.anon` | FALSE POSITIVE, reproduced 2026-09-08 (F-27). anon holds no grant on this table: `set role anon; update public.organization_member ...` fails with 'permission denied for table', so the write is refused at the privilege layer before RLS is consulted. This is the F-5 shape the repository already documented -- an outcome read as permitted because no error was the thing being measured. |
| `bypass:create_organization(org_name text, org_slug text)` | BY DESIGN, and the design is the point: 20260907140000 deliberately moved organization creation out of an INSERT policy into this RPC so that creating an org and becoming its owner are one transaction. It must be SECURITY DEFINER to grant the creator's membership, and EXECUTE is granted only to authenticated. As of 20260908130000 it is now the ONLY write path -- the vestigial direct INSERT grant is revoked. |
| `bypass:is_org_member(org uuid)` | BY DESIGN and structurally required. Every SELECT policy calls this helper; a SECURITY INVOKER version would query organization_member under the caller's own policy and Postgres would raise 'infinite recursion detected in policy', making the table unreadable by everyone. EXECUTE is revoked from PUBLIC and granted only to authenticated (REQ-11). Its logic is the one thing the generated suite cannot check, which is why the hand-written intent layer exists. |
| `bypass:org_role_of(org uuid)` | BY DESIGN, same structural reason as is_org_member: it is called from the organization DELETE policy and must not re-enter RLS. EXECUTE revoked from PUBLIC, granted to authenticated only (REQ-11). Covered by the intent suite rather than the generated one, because a helper whose logic is wrong is invisible to a suite that mocks it. |
| `bypass:organization` | PARTIALLY CLOSED 2026-09-08, remainder accepted. The INSERT half is gone and this row will keep reporting it anyway: the tool's sentence is a STATIC TEMPLATE that names INSERT/UPDATE/DELETE whether or not they are held. Measured directly rather than inferred -- has_table_privilege('authenticated','public.organization','INSERT') is false, and 20260908130000 is what made it so, leaving create_organization() as the only writer. UPDATE and DELETE remain granted to authenticated on purpose -- both are policy-gated (is_org_admin / owner) and are how a tenant administers itself, not a creation path. Narrowing those to RPCs is a design change, tracked as DEF-014. The claim above is falsifiable from inside the repository: supabase/tests/intent/002 asserts the privilege directly AND asserts the refusal message, because 42501 alone is returned by both the grant layer and the policy layer and cannot say which refused. |
| `bypass:organization_member` | ACCEPTED, and it is the tenancy model rather than an oversight. Every command here is policy-gated on is_org_admin, and the domain invariants that a policy cannot express -- only an owner may change ownership, an org may not be orphaned -- are enforced by triggers (20260907150000), not by withholding the grant. Moving membership administration behind RPCs is a design change, tracked as DEF-014. |
| `bypass:supabase_etl_admin` | NOT REACHABLE, reproduced 2026-09-08 (F-27). This is a Supabase platform role, not one this schema creates. No role is a member of it, and `set role anon; set role supabase_etl_admin` fails with 'permission denied to set role'. The prober flags it because it carries LOGIN and is absent from its own sanctioned list, which names service_role, postgres, supabase_admin, supabase_auth_admin and supabase_storage_admin but predates this role. It is not client-reachable in the sense the CRITICAL label implies. |

---

**⚠ 2 anomalies** — 2 adjudicated, 0 unexplained. Behavior differs from intent; each is a defect until explained.
