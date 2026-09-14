# Tenant isolation in the `storage` schema, and the schema every proof in this repository does not look at

_Researched 2026-09-14, for SPEC-018. Everything under "what is true today" was measured against the
local stack on that date and each claim names the query. The Postgres semantics are from the manual;
the Supabase API half is from their access-control page, and what that page does not answer is listed
rather than filled in._

## The question

SPEC-018 adds file storage. The reason it was chosen over a fifth ordinary table is that Supabase
stores objects in the **`storage` schema**, and every isolation proof this project has is scoped to
`public`:

```
scripts/check-schema-guard.mjs:32   where n.nspname = 'public' and c.relkind = 'r'
scripts/check-policies.mjs:448      rlsautotest --supabase      (its --help: "defaults it to public")
supabase/tests/rls/                 101 organization · 102 invitation · 103 member · 104 project
docs/ACCESS-MATRIX.md               those four tables, four identities
```

B-2 claims isolation is proven on **"every table, every command, every identity."** It is proven on
every table _in `public`_, and nothing in the repository says so. So the question this memo has to
settle is not "how do I write a storage policy" — it is **what the existing proofs can and cannot
see once tenant data lives outside `public`**, because that determines whether SPEC-018 is a feature
or an amendment to a bar.

## What is true today, measured

Ten tables live in `storage`. Every one has `relrowsecurity = t` and **`storage.objects` has zero
policies**:

```sql
select policyname from pg_policies where schemaname='storage' and tablename='objects';
-- (0 rows)
```

RLS enabled with no policies is deny-all, and it holds: `set role anon; select count(*) from
storage.objects` returns `0` rather than an error. **Fail-closed, and that is the good news.**

`relforcerowsecurity = f` on all ten, and the owner is `supabase_storage_admin`. Table owners bypass
RLS unless forced, so policies written here constrain the API's callers, not the storage service
itself.

### The part that matters, and it is F-1 in a schema F-1 did not reach

`anon` and `authenticated` hold **TRUNCATE, REFERENCES, TRIGGER and full DML** on `storage.objects`:

```sql
select rolname, has_table_privilege(rolname,'storage.objects','TRUNCATE') from pg_roles
 where rolname in ('anon','authenticated','service_role');
-- authenticated | t
-- anon          | t
-- service_role  | t
```

The same query against `public.organization` answers `f` for both — because **F-1 fixed it there.**
That migration's own words:

> Cause: `pg_default_acl` grants `Dxtm` (TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) to anon and
> authenticated for tables created by postgres — and **RLS does not apply to TRUNCATE at all**. No
> policy in this repo can prevent it, so it is invisible to every policy test. … This is a Supabase
> default, so every project inheriting it has the same grant.

Every sentence of that is still true. The fix says `in schema public` three times:

```sql
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate, references, trigger on tables from …;
alter default privileges for role postgres in schema public revoke … ;
```

**This project's headline finding is fixed in one schema and live in another**, and the guard written
afterwards cannot see it for two independent reasons: it filters `nspname = 'public'`, and its
subject is RLS _enablement_ — it contains no reference to privileges, grants or TRUNCATE at all. So
widening the schema filter alone would not catch this.

The Postgres semantic that makes TRUNCATE the sharp edge is confirmed from the manual rather than
memory:

> Operations that apply to the whole table, such as `TRUNCATE` and `REFERENCES`, are not subject to
> row security.

So the deny-all that holds SELECT does nothing about TRUNCATE. What holds today is **reachability**,
not permission: PostgREST exposes `schemas = ["public", "graphql_public"]`, so `storage` has no REST
surface. That is one line of `config.toml`, and "add `storage` to schemas" is a plausible thing for
someone building file storage to try.

**Latent, not live, and the distinction is a config value rather than a policy.**

## What the tooling can already do, and is not asked to

`rlsautotest --help` offers `--schema SCHEMA` and `--all-schemas` ("scan EVERY RLS-bearing schema").
keelblock invokes it with `--supabase`, which the same help says "defaults it to `public`".

**The tool is not the limit; the invocation is.** That is worth knowing before SPEC-018 designs
anything, because it means storage coverage is a flag and a generated suite rather than new
machinery — which is the opposite of what a project at 10:1 marginal spend on `scripts/` should be
building.

## What Supabase recommends for scoping, and what their page does not say

Policies go on `storage.objects`; "by default Storage does not allow any uploads to buckets without
RLS policies." Their documented tenant-scoping pattern is **folder-name conventions** —
`storage.foldername(name)` matched against a claim — with the worked example scoping to a user id
rather than an organization. Bucket-per-tenant is not discussed on that page. Service keys "entirely
bypass RLS policies".

Three things their page did **not** answer, listed because a spec would otherwise assume them:

- **Which role the storage API connects as**, and therefore whether RLS is enforced for API requests
  or evaluated by the service. The measured `relforcerowsecurity = f` plus
  `owner = supabase_storage_admin` means the answer decides whether a policy is a real boundary or a
  convention, and it is the single most important unknown here.
- **Whether signed URLs bypass policies** once issued, and for how long. A presigned URL that
  outlives a membership revocation is a tenant-isolation hole that no policy test would show.
- Whether `storage.buckets` policies matter alongside `storage.objects`.

## What this memo does not establish

- **Nothing was built.** No bucket, no policy, no upload. The folder-convention pattern was read, not
  run, and the first spike is expected to correct this memo — which is why it is written first.
- **The three unknowns above are unknowns**, not omissions. A spec that assumes an answer to the
  API-role question is assuming the thing that decides whether its policies are enforcement.
- **No claim about other schemas.** `auth`, `realtime` and `vault` were not examined. If the answer
  to "should the guard scan every schema" is yes, those are in scope and this memo did not look.
- **No measurement of whether `--all-schemas` passes.** It exists; it was not run.

## Sources

**Primary**

- Local stack, 2026-09-14 — `pg_class`, `pg_policies`, `has_table_privilege`,
  `information_schema.role_table_grants`. Every claim under "what is true today" names its query.
- [PostgreSQL — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
  — TRUNCATE and REFERENCES are not subject to row security; owners bypass RLS unless
  `FORCE ROW LEVEL SECURITY`.
- `supabase/migrations/20260907130000_revoke_destructive_defaults.sql` and `docs/FINDINGS.md` F-1 —
  the same defect, its measurement, and the schema its fix names.
- `rlsautotest --help`, version pinned in `requirements.txt`.

**Secondary**

- [Supabase — Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
  — policies on `storage.objects`, the folder-name convention, service keys bypassing. Consulted for
  the API half; the three unanswered questions above are unanswered _by this page_, and are the
  spike's job rather than another page's.
