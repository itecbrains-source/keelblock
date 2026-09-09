# `anon` can TRUNCATE your tables on a default Supabase project

**Status: ready to publish, not published.** Prepared 2026-09-09. Verified against Supabase CLI
2.109.0. Nothing here is specific to the project that found it, which is why it is worth publishing:
it affects projects that have never heard of us.

## The claim, in one sentence

On a default Supabase project, the `anon` role — the one whose key ships in your browser bundle —
holds **TRUNCATE** on tables in `public`, and **row-level security does not apply to TRUNCATE at
all**, so no policy prevents it and no policy test can see it.

## Reproduce it in about thirty seconds

Any default Supabase project. Connect as `postgres` and ask the catalogue what `anon` was given:

```sql
select coalesce(n.nspname, '(all schemas)') as schema,
       d.defaclrole::regrole            as granted_by,
       d.defaclacl::text                as default_privileges
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
where d.defaclobjtype = 'r' and n.nspname = 'public';
```

Measured on a stock local stack:

```
 public | supabase_admin | {postgres=arwdDxtm/supabase_admin,anon=arwdDxtm/supabase_admin,
                            authenticated=arwdDxtm/supabase_admin,service_role=arwdDxtm/supabase_admin}
```

`arwdDxtm` reads: INSERT, SELECT, UPDATE, DELETE, **TRUNCATE (`D`)**, REFERENCES (`x`), TRIGGER
(`t`), MAINTAIN (`m`). Then demonstrate it, inside a transaction you roll back:

```sql
begin;
create table public.probe (id int);
set local role anon;
truncate public.probe;      -- succeeds
rollback;
```

Add a policy first if you like. It changes nothing: **TRUNCATE is not a row operation**, so RLS is
never consulted. A generated per-table, per-command, per-identity policy suite will report the table
fully protected, because TRUNCATE is not one of the commands a policy can have.

## Scoped honestly, because the scope is the interesting part

**This is not a remote zero-click.** PostgREST exposes no TRUNCATE verb — a request asking for one
gets a 404, verified. You cannot lose your database from a browser with the publishable key alone.

What it is, is **blast radius**. It converts:

- any SQL injection in a `SECURITY INVOKER` function reachable by `anon` or `authenticated`,
- or one leaked role credential,

from a scoped read into **total, unrecoverable data loss with no `WHERE` clause to limit it**. It
also survives every audit that reasons about RLS, because it is not an RLS question.

## The fix

Two statements, and the second is the one people miss — revoking on existing tables does nothing for
the table you create next week:

```sql
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;
```

## What the fix does not cover, measured on a project that has applied it

`alter default privileges` only changes entries for roles you can act for. After the statements
above, the catalogue on a fixed project reads:

```
 public | postgres       | {postgres=arwdDxtm/postgres,authenticated=m/postgres}          ← fixed
 public | supabase_admin | {...,anon=arwdDxtm/supabase_admin,...}                         ← unchanged
```

Every table a migration creates is created by `postgres`, so the fix covers them. A table created by
`supabase_admin` would still pick up the original grant, and a migration cannot alter that entry.
Stating it rather than implying the problem is wholly gone: the practical exposure is closed, the
catalogue entry is not.

## Why it is worth someone's attention

The grant is a **default**. Nobody chose it, most projects have it, and the two habits that would
normally catch a permission problem both miss this one: reviewing your policies, because it is not a
policy; and running a policy test suite, because TRUNCATE is not a command those suites enumerate.
It is invisible to exactly the people being careful.

---

_Prepared for the owner to publish. Not posted: publishing under the project's identity is an
outward-facing act and is not a session's to perform._
