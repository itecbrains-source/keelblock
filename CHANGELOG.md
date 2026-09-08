# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

**Security fixes name the defect and how to reproduce it, including the ones we caused ourselves.**
A project whose claim is provable correctness cannot publish only its wins — the self-inflicted
entries are what make the rest worth believing. Full reproductions live in
[`docs/FINDINGS.md`](docs/FINDINGS.md).

## [Unreleased]

The tenancy foundation, the proof harness, the gates, sign-in and organizations (SPEC-001, SPEC-002,
SPEC-003, SPEC-004, SPEC-005). Invitations, billing and the remaining product surfaces are specced
and not built — run `npm run status`, which reads the repository rather than this paragraph.

### Changed

- **Renamed `keel` to `keelblock`** ([ADR-015](docs/adr/ADR-015-the-name.md)). `keel` and
  `create-keel-app` are both live on npm and keel.so is a funded developer-tools company, so bar
  B-1's headline command scaffolded somebody else's project. Verified with a positive control before
  choosing; the npm pair and `keelblock.dev` are free. Prose is US English throughout.

### Added

- **Organizations and roles (SPEC-005).** Create an organization, switch between the ones you belong
  to, and administer members — the first authenticated route, and the first point at which the
  isolation claim is demonstrable rather than proven over a fixture. Verified with two real accounts
  through the running application: neither can read the other's project, and putting somebody else's
  organization id in your own cookie shows you nothing, because **the switcher is a view selection
  and was never a boundary**. No organization or role is carried in a JWT claim, deliberately: an
  access token lives up to an hour, so a claim-based check would keep a revoked admin an admin until
  it turned over.
- **Sign-in, by emailed link (SPEC-004).** Magic link and OAuth through PKCE, a callback that
  validates its own redirect target, sign-out, and a session refreshed at the network boundary.
  Verified end to end against the local stack rather than asserted: the flow is recorded in the
  spec, and the callback's redirect carries `private, no-cache, no-store` alongside two auth
  cookies. OAuth ships behind a configured-provider list, so no provider button renders until one
  exists — a button that always fails is a worse affordance than none (DEF-018, DEF-019).
- **Every Server Action must authorize, or the build refuses it.** Resolved per action through the
  module graph, with a deliberately-public allowlist that carries a written reason for each entry.
  Next.js documents the exposure itself: an exported action is reachable by direct POST even when
  nothing imports it, and a page-level check does not extend to it.
- **The battlecard is generated** from the specs it describes, into the same gate as the database
  types and the access matrix. Status, criteria counts and every evidence link are derived; the
  claim and the argument are written once. A spec that ships now declares what it lets keelblock
  claim, or the `content` gate fails.

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
- **CI running on a real remote**, green on every job — `check`, `audit`, `codeql`, `secrets` — plus
  a nightly clean-clone build and a nightly fresh dependency resolution. The steps `npm run verify`
  could previously only assert are now observed.
- **Review dispositions** ([`docs/review/DISPOSITIONS.md`](docs/review/DISPOSITIONS.md)) — an external
  review is tracked to closure: every finding is implemented, refuted or deferred, whether it is
  closed is computed rather than asserted, and a finding deferred to a deferral that later closes
  fails the build until it is answered again.
- **Adjudication on the access matrix** — an anomaly or bypass surface must be absent or answered
  with a written reason in `keelblock.access-allowances.json`, published in the artifact itself. The
  gate previously compared the document for freshness and was indifferent to what it said.

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
- **A privilege boundary that was inherited rather than stated (F-31).** `anon` regained DML on every
  tenant table on `supabase/postgres:17.6.1.167`, where it has none on `.140` — so an assertion green
  on every local run failed the first time it ran anywhere else. RLS still held (every policy is `to
authenticated`), but the layer before it did not, and defense in depth is the thing you cannot
  notice losing. All three roles' privileges are now stated by migration. **This affects every
  project that assumes Supabase's defaults are fixed.**
- **A role that could destroy a table it could not read (F-28).** The F-1 revoke covered `anon` and
  `authenticated` and not `service_role`, which kept `TRUNCATE` on all three tenant tables while
  holding no DML at all. Not remotely exploitable — `service_role` is server-only — but it made a
  leaked service key total data loss rather than a scoped read.
- **`EXECUTE` to `PUBLIC` on the two trigger functions.** REQ-11 wrote the rule down and applied it
  to the helpers; the trigger functions added three migrations later kept the default. Postgres
  refuses a direct call to a function returning `trigger`, so this was defense in depth rather than a
  live hole. Revoked from `public`, `anon` and `authenticated` by name, because revoking from
  `PUBLIC` alone was enough on one image and not on another.

### Fixed

- **Our own gate could not fail (F-13).** `vitest --passWithNoTests` ran against zero test files and
  printed a green tick, while the function generating the access matrix had no test. The rule
  requiring a mutation proof per gate was written down and then violated by the gate enforcing it.
  Every gate now carries mutation proofs.
- **The check that certified every other check was a substring search (F-30).** The meta-gate
  asserted every gate had been shown to fail by looking for the word MUTATION in its test file; any
  comment mentioning it satisfied that. It now asks the parsed test file whether a case named as a
  mutation proof calls something the gate exports. Every existing proof passed the stronger rule.
- **The anti-stale-documentation gate could not see the form this repository writes in (F-23).** The
  rule was digits-only, and every stale count here was spelled out — eighteen of them, including the
  line in `AGENTS.md` telling a coding agent the decision record held eleven entries when it held
  fifteen.
- **A generated artifact that could not be regenerated from the repository (F-29).** The committed
  database types carried pgTAP's own views, because they were generated on a machine where the
  extension happened to be resident. `check-policies` now removes it after the run, and the CLI is
  pinned — a generated artifact can only be compared against a pinned generator.
- **An overclaimed guarantee (F-14).** The membership invariants were documented as binding the
  service role. They do not, and could not: that identity can drop the trigger. Corrected to say what
  is true. An overclaimed guarantee is worse than an absent one, because people build on it.
