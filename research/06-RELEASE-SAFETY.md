# Release safety — migrations, drift, and what a preflight must actually check

_Researched 2026-09-07. **This memo corrected SPEC-016 in three places**, which is the argument for
having written it before building rather than after._

## What I had wrong

SPEC-016 was authored from reasoning about the code/schema deploy race. Three corrections:

### 1 · Expand-contract is three phases, not two

I wrote _"schema first, code after."_ The pattern is **Parallel Change**, named by Danilo Sato on
Martin Fowler's bliki in 2014 — the primary source for it — and it has three phases:

| Phase        | What happens                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Expand**   | Add the new column/table/index. Remove nothing.                                                                                            |
| **Migrate**  | Backfill, and have the application **dual-write** or read-new-with-fallback. Confirm consistency **under real traffic**, not just staging. |
| **Contract** | Only once every running instance uses the new structure, remove the old.                                                                   |

The invariant, in the original's words: throughout expand and migrate, _"existing clients will
continue to consume the old version, and the new changes can be introduced incrementally without
affecting them."_ **The middle phase is where the actual work is**, and I had omitted it entirely —
which would have produced a preflight that waves through a two-step deploy that still breaks.

### 2 · "Wait a full rollout cycle" is the part nobody specifies

The literature is explicit that contract must not run until every instance is on the new code, and
vague about how you _know_. For keelblock this is answerable rather than hand-waved: the deep health
endpoint already reports the applied migration head, so the contract phase can require evidence
rather than a guess.

### 3 · A preflight without a verified restorable backup is missing the point

Standard deployment checklists put **automated timestamped backups plus restore drills** ahead of
everything else — a backup nobody has restored is a belief, not a backup. SPEC-016 did not mention
backups at all. That is the most serious omission the research found.

## What the research added

**Lock-taking DDL is its own hazard class**, separate from destructiveness. From the PostgreSQL
documentation directly:

> _"Normally PostgreSQL locks the table to be indexed against writes and performs the entire index
> build with a single scan of the table. Other transactions can still read the table, but if they try
> to insert, update, or delete rows in the table they will block until the index build is finished."_

Neither destructive nor obviously dangerous — and it takes production down under load. A preflight
checking only for `DROP` misses it entirely.

**`CONCURRENTLY` has caveats a migration runner will hit**, and these are the ones that matter here,
again from the primary source: it **cannot be performed within a transaction block** — which most
migration tools use by default, so the migration simply fails — it takes significantly longer, it is
unsupported on partitioned tables, and on failure it **leaves behind an "invalid" index** that must be
cleaned up. A preflight should know all four.

**Drift is best expressed as a fingerprint comparison.** The 2026 practice is a registry holding an
approved schema fingerprint; CI computes the current one and **halts on difference until a human
reviews it**. That is cleaner than keelblock's "compare migration sets" and catches the case a set
comparison misses — the same migrations applied, but the resulting schema altered by hand.

**`pgroll` exists** — zero-downtime, reversible, expand-contract-native Postgres migrations. Worth
evaluating before building anything in this area. The instinct to build a migration framework here
would be the delegate-not-implement lesson broken in a place where it applies.

## What keelblock should do

1. Preflight classifies pending migrations into **additive · lock-taking · destructive**, not a binary.
2. A destructive change requires evidence that the **migrate** phase completed — not merely that it
   was split into two deploys.
3. Preflight verifies a **recent, restorable** backup — and "restorable" means a drill has run.
4. Drift becomes a **schema fingerprint** compared against an approved value, not a migration-list diff.
5. Evaluate `pgroll` before writing migration machinery.

## Sources

**Primary** — the originating description of the pattern, and the database's own documentation:

- [Danilo Sato — Parallel Change](https://martinfowler.com/bliki/ParallelChange.html) (martinfowler.com, 2014) · where expand/migrate/contract is named and defined
- [PostgreSQL — `CREATE INDEX`](https://www.postgresql.org/docs/current/sql-createindex.html) · locking behavior, `CONCURRENTLY`, and its four caveats, quoted above
- [PostgreSQL — `ALTER TABLE`](https://www.postgresql.org/docs/current/sql-altertable.html) · which forms rewrite the table
- [pgroll](https://github.com/xataio/pgroll) · the tool's own repository, for what it does and does not do

**Secondary** — used to orient, not relied upon for any claim:

- [Xata — zero-downtime schema migrations in PostgreSQL](https://xata.io/blog/zero-downtime-schema-migrations-postgresql) · vendor-authored, and the vendor sells the tool
- [Octopus Deploy — deployment checklist](https://octopus.com/devops/software-deployments/deployment-checklist/) · where the backup-and-restore-drill point came from; it is a practitioner checklist, not a standard
