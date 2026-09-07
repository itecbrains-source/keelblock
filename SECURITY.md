# Security policy

keel's central claim is that tenant isolation is enforced by the database and proven on every commit.
A hole in that claim is the most serious kind of bug this project can have, and it will be treated
that way.

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private vulnerability reporting on this repository
(Security → Report a vulnerability), which reaches the maintainers without disclosing the issue.

Please include, if you can: what you observed, the smallest reproduction you have, and which version
or commit you were on. A reproduction against a local `supabase start` stack is ideal — it is exactly
how the findings in [`docs/FINDINGS.md`](docs/FINDINGS.md) were established.

## What counts as a vulnerability here

In rough order of severity:

1. **Cross-tenant access** — any path by which one organisation reaches another's data. This is the
   claim; a hole in it is critical even if it needs unusual conditions.
2. **Privilege escalation** — a member gaining rights they were not granted.
3. **A gate that cannot fail** — a check that reports green while the defect it exists to catch is
   present. This is a vulnerability in the *evidence*, and evidence is what keel sells.
4. Anything reaching a secret, or a service-role client reachable from a rendered page.

## What we will do

Acknowledge quickly, reproduce, and fix. A cross-tenant fix ships as a **new migration**, which is
deliberate: a new migration file cannot conflict with your project however far it has diverged, so a
security fix can actually reach you (see [ADR-008](docs/adr/ADR-008-upgradability.md)).

Fixed issues are published in [`docs/FINDINGS.md`](docs/FINDINGS.md) with the reproduction — including
ones we caused ourselves. A project claiming rigour that publishes only its wins is doing marketing.

## Scope

This repository. Supabase, Next.js and Postgres themselves have their own disclosure processes — but
if a *default* in one of them makes keel-shaped projects unsafe, tell us: F-1 in our findings is
exactly that, and it affects every project inheriting the same default.
