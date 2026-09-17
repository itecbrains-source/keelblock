# State at the pause, and what a resuming session needs — 2026-09-14

```yaml
record: 14
commit: bb511f8
date: 2026-09-14
```

**Ninth dated record**, covering the thirteen commits since record `13` was written at `848a7e0`.

It carries no score. Record 13's 81 stands as the current one under rule 4 only because no later
record supersedes it — not because this record endorses it. The scorecard has no dimension that asks
whether the shipped product works, and the three defects that motivated withdrawing it (an open
redirect in the auth path, every page rendering in the browser default serif, a primary journey that
dead-ended) were all invisible to every dimension it does have. A number here would repeat that.

This record exists because work pauses at `bb511f8` and resumes in a few days. Its job is to let a
session that has read nothing else start from verified fact rather than from this folder's prose.

## What is true, each with the command that produced it

Verified by the review seat at `bb511f8`, not taken from the building session's report.

| Claim                                   | Command                                                                 | Result                                                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI green                                | `gh run list --repo itecbrains-source/keelblock`                        | `bb511f8` success, seven jobs                                                                                                                       |
| Nightly green on its schedule           | `gh run list --workflow nightly`                                        | four consecutive `schedule` runs green (`34459769730`, `34583308106`, `34684538923`, `34750463127`); step lists checked, `npm test` ran in all four |
| Five tenant tables                      | `select count(*) … where nspname='public' and relrowsecurity`           | 5                                                                                                                                                   |
| The fifth is unwritable by its tenant   | `set role authenticated; insert into public.organization_entitlement …` | `ERROR: permission denied for table organization_entitlement` — the privilege layer, before any policy                                              |
| Its grants                              | `information_schema.role_table_grants`                                  | `authenticated:SELECT`; `service_role: NONE`                                                                                                        |
| RLS forced on it                        | `pg_class.relrowsecurity/relforcerowsecurity`                           | both `true`                                                                                                                                         |
| No silent default on an unmapped status | `select prosrc from pg_proc where proname='status_entitles'`            | `plpgsql`, explicit `raise exception` in the `else`, eight statuses mapped                                                                          |
| Unit suite                              | `npm test`                                                              | 636 passed — see the flake below                                                                                                                    |
| Environment                             | `select version()`, `supabase --version`                                | PostgreSQL 17.6, Supabase CLI 2.109.0, `config.toml:42 major_version = 17`                                                                          |
| No hosted project exists                | `.env.local`, `.env.example`, `supabase/.temp`, `deploy.yml`            | all loopback; no `project-ref`; `deploy.yml` references no database                                                                                 |

The last row matters more than it reads. The local image is the only environment there is, so every
measurement below is the state of every scaffolded machine, not a hypothetical about a deployment
nobody has made.

## The F-1 residue, corrected

The review seat reported this as three tables. **It is seven.** The error was scanning four schemas
and generalising; `net` and `supabase_functions` were never looked at. The building session's FAQ
number was right and the review seat's was wrong.

```sql
select n.nspname||'.'||c.relname, c.relrowsecurity,
       (select count(*) from pg_policy p where p.polrelid=c.oid)
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where c.relkind='r' and has_table_privilege('anon', c.oid, 'TRUNCATE');
```

```
net._http_response              rls=f  policies=0
net.http_request_queue          rls=f  policies=0
storage.buckets                 rls=t  policies=0
storage.buckets_analytics       rls=t  policies=0
storage.objects                 rls=t  policies=0
supabase_functions.hooks        rls=f  policies=0
supabase_functions.migrations   rls=f  policies=0
```

Four of the seven carry **no RLS at all**, which is a different shape from the storage three and
fails differently. "RLS enabled with zero policies" is fail-closed for row DML; no RLS is not. Any
write-up that treats the seven as one class will be wrong about four of them.

`public` is clean. F-1's fix holds exactly where it was applied.

## Who enforces isolation in `storage` — settled by execution

The question memo 16 said a spike was needed for. Answered inside a transaction that was rolled back;
residue afterwards was `buckets=0 objects=0 policies_on_objects=0`.

Two tenants' objects in one bucket, one policy permitting `org-A` only:

```
rows present (superuser)                             : 2
supabase_storage_admin  row_security_active = false  sees 2   <- the policy does not bind it
authenticated           row_security_active = true   sees 1
anon                                                 sees 1
```

`supabase_storage_admin` is the role storage-api actually connects as — observed in
`pg_stat_activity`, not assumed. It owns `storage.objects` and `relforcerowsecurity = false`, so it
bypasses RLS.

**What this establishes:** a policy on `storage.objects` is not an enforced boundary against the
storage service. In `public` the database refuses regardless of the caller. In `storage` it does not.

**What this does not establish:** that storage-api is unconstrained. It almost certainly assumes a
role per request — `SET LOCAL ROLE` plus `request.jwt.claims` — which is how storage RLS is
documented to work. If so, isolation there is enforced by the service _choosing_ to assume a
constrained role, which is a materially different claim from the one on the landing page.

**The one question left**, and the whole of what the spike still owes: _does storage-api assume a
constrained role per request?_ Not observable at rest — `SET LOCAL ROLE` is transaction-scoped and
the connection idles between uploads. It needs one real upload while sampling `pg_stat_activity`, or
storage-api's source. SPEC-018 turns on the answer and is `planned`, not authored, so the cost of
being wrong is still zero.

## Open, and where it sits

**Alignment, carried from the review seat's last pass:**

- `README.md` and `docs/FAQ.md` were both corrected in `64d2102`, which is an ancestor of this
  record's commit. Each now names the residue and dates the measurement. **The review seat reported
  the README as unfixed and was wrong** — it read line 80 alone, which still opens with the original
  sentence, and did not read lines 81–83 where the correction is. The same error shape as the
  three-versus-seven mistake above: sampling one line and generalising to the claim. Corrected here
  on 2026-09-17, before this record was committed.
- `spec/SPEC-003-gates.md:115` (AC-3) is marked `done` on evidence F-78 showed was partial. The
  status is defensible; the wording describes a test existing rather than a property holding. **Still
  open** — re-checked 2026-09-17 by reading the whole table row rather than grepping for a phrase.
- SPEC-018's one-liner was corrected and no longer asserts what memo 16 disproved.

**Unverified by the review seat, in either direction:** S-13 (inherited default privileges on
`organization_invitation` for `authenticated`, reported by the 2026-09-10 external review as
currently harmless);
SHA-pinning the 32 mutable action tags; the freshness gate tracking 12 of 32 declared dependencies;
the README/FAQ count claims the 2026-09-10 external review reported, which neither seat has
reproduced.

**Two flakes, and the second is in the gate that proves the one claim.**

`npm test` returned `1 failed | 635 passed (636)` on one run at `bb511f8`, then `636 passed` on five
consecutive runs after. The failing test's name was lost before capture and it did not reproduce.
Recorded as unexplained rather than as a defect.

`npm run check` then failed on `policy`, which had passed minutes earlier in the same session. It is
**flaky at two failures in five runs locally**, and the failure is always the same:

```
psql:supabase/tests/intent/failure-message.test.sql:44: ERROR: deadlock detected
DETAIL: Process A waits for AccessExclusiveLock on relation 16458 (auth.users);
        blocked by process B.
        Process B waits for RowExclusiveLock on relation 18591 (public.organization);
        blocked by process A.
Result: FAIL
```

What was ruled out, by execution rather than by reading: **the F-1 TRUNCATE regression test is not
the cause.** `001-tenant-isolation.test.sql:164` runs `truncate public.organization cascade` as
`anon`, which looks like the obvious lock-taker. It is not — with another session deliberately
holding a `ROW EXCLUSIVE` lock on `public.organization`, that statement still returns
`ERROR: permission denied for table organization` immediately. The privilege check precedes lock
acquisition, so the assertion never takes a lock and cannot deadlock. That was the review seat's
first hypothesis and running it refuted it.

What was **not** identified: nothing in `supabase/tests/` issues a `TRUNCATE`, `DROP` or `ALTER`
against `auth.users`, so the `AccessExclusiveLock` on it originates outside the suite — most likely a
concurrent Supabase service or `supabase test db`'s own reset between files. That is where a resuming
session should start.

Materiality: `policy` is the gate behind the single claim this project exists to make. A proof
harness that fails for reasons unrelated to what it proves is a harness whose green is worth less
than it looks, and "re-run it" is the habit that hides it.

**Re-tested 2026-09-17: four runs, four passes. It did not reproduce.** One thing changed and it is
the most interesting fact here — the Supabase stack had been restarted about five hours earlier
(`docker ps` → `Up 5 hours`), whereas on 2026-09-14 it had been running continuously for days. That
is a correlation and not a demonstration; nobody has left a stack up for days and re-run the suite to
confirm it. If it holds, the shape is worth naming: **the failure appears on a long-lived local stack
and not on a fresh one, which is exactly the environment a developer has and CI never does.** CI
starts a new stack every run, so a green CI is not evidence against this, and the developer running
it on day three is the person who meets it.

Two failures in five runs on 2026-09-14, zero in four on 2026-09-17, is the whole of the evidence.
Neither number is a rate.

**Owner's, and nobody else's:** three Vercel secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`,
`VERCEL_PROJECT_ID`); publishing `create-keelblock-app` — `npx create-keelblock-app myapp` still
exits with _"could not determine executable to run"_, and the registry manifest is two files, 1,225
bytes, no `bin`, self-described _"Not yet functional"_, so B-1's headline command does not work for
any user; publishing F-1; and whether record 13's score is withdrawn in the repository rather than
only in conversation.

## Themes 3 and 4

Both open, and no work in these thirteen commits touched either.

Theme 3, measured on the 2026-09-10 external review's own definition (`KEEL-EVALUATION.md:61-63` —
`scripts/` lines over `src/` lines excluding tests):

```
stock     3.87 (review, 114 commits)  ->  3.99 (da3ce0b)  ->  4.04 (8d3f067)
```

The stock ratio barely moves because history dominates it. The marginal rate is the live number: over
the seven commits between the review and `8d3f067` it was **10.0 : 1**, up from 8.2 : 1 measured two
commits earlier. `bb511f8` is the first commit in this stretch to add product code, and it is the
owner's scope decision that produced it, not a mechanism.

That is the whole of Theme 3 restated: there is still no gate anywhere here that can fail because the
project is spending too much on itself. Every proposal for one has been declined for the same sound
reason — the ceiling would be set by the same party it constrains, which is how the self-imposed
eleven-gate ceiling came to be broken by its own author. The observation is recorded; the mechanism
does not exist.

Theme 4 is unchanged: nobody outside this project has tried to use it. DEF-024 has been open since
day one. Four rendered pages against a nineteen-area scope is the reason.

## For the session that picks this up

Start with `npm run status` and `npm run check`, not with this folder. This record is a frozen claim
about `bb511f8` and will be stale the moment anything lands; the gates are computed. Where they
disagree with anything above, they are right and this record is the thing that aged.

The two corrections in this record — seven tables rather than three, and the storage question settled
by execution rather than left to a spike — both came from re-running a measurement rather than
re-reading a report. That is the only method this seat has that reliably works.
