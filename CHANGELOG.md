# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

**Security fixes name the defect and how to reproduce it, including the ones we caused ourselves.**
A project whose claim is provable correctness cannot publish only its wins — the self-inflicted
entries are what make the rest worth believing. Full reproductions live in
[`docs/FINDINGS.md`](docs/FINDINGS.md).

## [Unreleased]

The tenancy foundation, the proof harness and the gates. Auth, billing and the product surfaces are
specced and not yet built — see [`spec/README.md`](spec/README.md).

### Added

- **Tenancy foundation** — `organization`, `organization_member`, a hardened membership predicate,
  and RLS on every tenant-scoped table with a `WITH CHECK` that constrains the organization.
- **Access matrix** ([`docs/ACCESS-MATRIX.md`](docs/ACCESS-MATRIX.md)) — generated from the live
  policy catalog by probing as each identity, committed, diffable, and stale copies fail the build.
- **Four-layer test strategy** — unit, generated policy (`rlsautotest`), hand-written intent, and
  journey (pending auth). 21 intent assertions; 54 generated.
- **`npm run check`** — every gate, all failures reported rather than the first.
- Organization creation as a `SECURITY DEFINER` RPC, so there is no unconstrained INSERT policy.
- CI per commit, a nightly clean-clone build and a nightly fresh dependency resolution, gitleaks over full history; MIT license; security policy;
  contributor guide; honest `error` and `not-found` states; the three Supabase clients, with the
  service-role client behind a `server-only` import boundary.

### Security

- **Privilege escalation (F-9).** An admin could demote the owner (`UPDATE 1`) and seize any
  organization they administered. Fixed by a trigger: an owner row may only be created, changed or
  removed by an owner.
- **Orphaned organizations (F-10).** The last owner could delete their own membership, leaving an
  organization nobody could administer or delete, holding its slug forever. Fixed by a per-statement
  invariant that still permits succession.
- **`anon` could `TRUNCATE` every tenant table (F-1).** Supabase's default privileges grant
  `TRUNCATE` to `anon` and `authenticated`, and RLS does not apply to `TRUNCATE`, so no policy or
  policy test could see it. Revoked, with default privileges altered so a later table cannot
  reintroduce it. **This affects every project inheriting the same Supabase defaults.**
- **`EXECUTE` defaults to `PUBLIC` (F-7).** The membership helper was callable by `anon` — an
  unauthenticated oracle over an RLS-protected table. Revoked.

### Fixed

- **Our own gate could not fail (F-13).** `vitest --passWithNoTests` ran against zero test files and
  printed a green tick, while the function generating the access matrix had no test. The rule
  requiring a mutation proof per gate was written down and then violated by the gate enforcing it.
  Every gate now carries mutation proofs.
- **An overclaimed guarantee (F-14).** The membership invariants were documented as binding the
  service role. They do not, and could not: that identity can drop the trigger. Corrected to say what
  is true. An overclaimed guarantee is worse than an absent one, because people build on it.
