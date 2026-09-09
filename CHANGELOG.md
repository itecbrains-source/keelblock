# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

**Security fixes name the defect and how to reproduce it, including the ones we caused ourselves.**
A project whose claim is provable correctness cannot publish only its wins — the self-inflicted
entries are what make the rest worth believing. Full reproductions live in
[`docs/FINDINGS.md`](docs/FINDINGS.md).

## [Unreleased]

The tenancy foundation, the proof harness, the gates, sign-in, organizations, invitations, the
upgrade path and the scaffolder that produces a project able to take one (SPEC-001, SPEC-002,
SPEC-003, SPEC-004, SPEC-005, SPEC-006, SPEC-011, SPEC-013), and the handover trial that measures
whether any of it can be picked up by a stranger (SPEC-024). Billing and the remaining product
surfaces are specced and not built — run `npm run status`, which reads the repository rather than
this paragraph.

### Added

- **The getting-started page, executed (SPEC-012).** B-5's proof is "a scripted walkthrough run by
  someone with no prior context, timed and recorded" — a promise about a future event, which is the
  shape B-1 was in until last week. This keeps the half a machine can keep: a runner extracts the
  page's shell blocks and executes them in one shell in an empty directory, because a person follows
  a page in one terminal and `cd my-app` is load-bearing for everything after it. Borrowed from
  rustdoc, which runs Rust's documentation examples so they stay "up to date and working", including
  its in-band way for a block to say it cannot run. The job asserts an **artefact** — a project that
  exists, declares itself generated and passed its own suite — not an exit status. **B-5 is NOT
  claimed**: a machine will happily execute an incomprehensible page, and whether a newcomer can
  follow it is DEF-024. Measured on the closest comparable kit: its CI runs npm scripts and no step
  executes its installation documentation.

- **`create-keelblock-app` (SPEC-011), and the thing it is actually for.** Bar B-1 claims a running
  application in five minutes; before this it was not unmet but **unfalsifiable**, because the tool
  did not exist. The interesting half is not copying files. Scaffolding and upgrading are one
  decision seen twice, and the memo measured what happens when it is got wrong: a plain tarball copy
  — the ordinary shape of a `create-*-app` output — dies on `scripts/upgrade.mjs`'s first command
  with `fatal: bad object`, while the same copy with a remote pointing home takes 52 upstream-owned
  files cleanly. B-10's job was green throughout, because its scaffold is a `git worktree` carrying
  every ref, which no buyer will have. So a generated project records its release **and** commit,
  keeps the remote, and is told the two-command upgrade. Five minutes is now a CI job with a budget.
  What a generated project does **not** get was measured too, by building one and running
  `npm run check` inside it: keelblock's review records cite keelblock's commits and cannot travel,
  and its research and content gates would have failed a buyer's build 88 days after generation
  demanding they re-read Google's SEO documentation — a dated fuse, fixed before shipping and the
  answer to DEF-010.

- **The handover trial (SPEC-024), and what it found.** B-11 asks whether someone who has never seen
  this repository can add a tenant-scoped feature and be told when they get it wrong. A fresh agent
  session, given one brief and no help, built an organization-scoped notes feature in about half an
  hour with the gate suite green — writing `force row level security`, the explicit grant and a
  `revoke update, delete` unprompted, and running its own mutation proof. **What it found is the
  point:** nothing in the gate suite runs `next build`, so a build-only failure arrives disguised as
  "the web server did not start" (F-49); and a fix for a documentation defect had introduced one, so a
  careful reader concluded the flagship recipe was wrong when it was right (F-50). Three of its
  documentation findings were fixed in the same change. **One trial finds about a third of what is
  there**, so B-11 is claimed at one agent trial with the human half open (DEF-024).
- **The upgrade path (SPEC-013), and the experiment that corrected it.** `PRODUCT.md` calls
  upgradability the deepest structural failure in this category. A synthetic buyer was scaffolded at
  `v0.1.0` — cut before the `is_org_admin` NULL fix so the payload was a real security fix — given
  their own later migration and a product edit, and handed the fix. It did not apply:
  `supabase migration up` refuses a migration whose version sorts before the buyer's last applied
  one, which is the ordinary case. ADR-008 had chosen its whole strategy on the claim that such a
  file "never conflicts"; that claim is now corrected in the ADR rather than worked around (F-45).
  The ownership boundary is a list in `scripts/upgrade.mjs` with a mutation proof that an upgrade
  never takes a path under `src/`, and the path is executed by a CI job rather than documented.
  **B-10 is claimed** as of run 34282685924, whose log was read rather than its badge: it names the
  tag, the buyer's own migration, the two applied out of order, and every file in today's suite. The
  buyer is synthetic — keelblock has no users, and nobody has upgraded anything.

### Added

- **Invitations (SPEC-006).** Invite by email, preview with the token alone, accept, revoke. The
  token is 256 bits and only its sha256 is stored, so a leaked table is not a set of working
  invitations, and the link is shown to the inviter exactly once because no screen can recover it
  afterwards. **The one row a non-member must read is exposed through a single `SECURITY DEFINER`
  function returning a named two-column type** — not a policy admitting `anon` plus an
  application-side token filter, which selects the row before deciding the caller was entitled to it
  ([`research/09-INVITATION-BOUNDARY.md`](research/09-INVITATION-BOUNDARY.md)). Spent, revoked,
  expired and invented tokens are all answered identically, so the endpoint is not an oracle.
- **Revocation is now walked, not argued.** SPEC-005 claimed a removed member loses access on their
  next request rather than at token expiry, because membership is read from the table inside the
  policy. There was nothing to revoke yet. There is now: a journey signs Bob in, has Alice remove him
  through her own screen, and reloads — his session still valid, his access gone. The test is
  mutation-proven; skipping the removal makes it fail.

### Fixed

- **`is_org_admin` returned NULL for a non-member, and NULL is not false** (F-40). Its sibling
  `is_org_member` is built on `exists` and returned false; this one was
  `org_role_of(org) in ('owner','admin')`, and `org_role_of` is NULL for a non-member. Harmless in a
  policy, where Postgres treats NULL as a refusal — which is why no isolation test could see it, and
  why the generated prober, which mocks these helpers, never could either. It surfaced the moment a
  procedural caller wrote `if not public.is_org_admin(org)`: `not NULL` is NULL, the branch does not
  run, and an invitation was minted into an organization the caller had no membership in, with no
  error. Fixed in the helper rather than the caller, because the next caller has every reason to
  trust a boolean-returning function named `is_…`.
- **The exhaustive RLS prober was covering one table while reporting three** (F-41). `check-policies`
  invoked the generator once per table, and each run ends by reconciling away files "no longer part
  of this run" — correct for the whole-schema invocation the tool documents, lethal in a loop. The
  gate counted exit codes rather than files, and `--no-fail` returns zero, so it printed three table
  names while one suite existed on disk. It now runs once for the schema and refuses to report
  coverage it cannot find in the directory.
- **`organization_invitation` shipped with RLS enabled but not FORCED**, so its owner — and every
  `SECURITY DEFINER` function, which runs as that owner — bypassed it. The other three tenant tables
  have carried `force row level security` since the foundation migration. The new-table guard, whose
  stated job is that every tenant table is protected, did not check for it; it does now, with a
  planted violation proving it.
- **An `owner` invitation could be minted and never accepted.** The SPEC-001 owner-authority trigger
  refuses the membership `accept_invitation` would create, so the invitee read "invited you to join
  as owner", pressed Accept, and got "not found" forever. Refused at mint instead: letting acceptance
  through would have required bypassing that trigger, which would turn a token into a route from
  admin to owner.

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
