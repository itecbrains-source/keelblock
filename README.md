# keel

**A multi-tenant SaaS starter where tenant isolation is enforced by the database and proven on every
commit.** Next.js 16 · React 19 · TypeScript · Supabase · Stripe. MIT.

> **Status: foundation.** The tenancy layer, the proof harness and the gates are built and green.
> Auth, billing and the product surfaces are specced and not yet built — see
> [the spec index](spec/README.md). This README describes what exists today, not what is planned.
> If that distinction ever blurs, the project has failed its own first rule.

---

## Why this exists

Every comparison of SaaS starters reaches the same conclusion, in their words:

> _"Multi-tenancy, enterprise auth, and audit-grade security are not what these tools produce out of
> the box — they produce a starting point, not a production enterprise system."_

The field is priced $199–$1,499 and closed. The free options are a deliberately minimal reference
kit that uses neither Supabase nor RLS, and one that is three Next majors behind. **None of them —
paid or free — ships proof that its tenant isolation works.**

keel is the one that does, and it is free.

## The claim, and how to check it

Isolation is proven per table × command × identity, and the result is published as
**[`docs/ACCESS-MATRIX.md`](docs/ACCESS-MATRIX.md)** — generated from the live policy catalog by
probing the database as each identity, so it describes what the database _does_, not what anyone
believes it does. It is regenerated on every run and a stale copy fails the build, so a policy change
that alters who can reach what shows up as a diff in review.

**A new tick in the "different organisation" column is a tenant leak, caught in a document before it
reaches a user.**

Four test layers, each answering a different question:

| Layer            | Question                                                 | How                                         |
| ---------------- | -------------------------------------------------------- | ------------------------------------------- |
| Unit             | is this pure logic correct?                              | Vitest, with a mutation proof per gate      |
| Generated policy | does the database enforce what the policies **declare**? | `rlsautotest` → pgTAP, regenerated each run |
| **Intent**       | are the policies **what we meant**?                      | hand-written, adversarial pgTAP             |
| Journey          | does the real authenticated flow work?                   | Playwright _(with auth, SPEC-004)_          |

The middle two are not redundant, and we measured why: a helper that dropped its `user_id` check
produced a **total cross-tenant leak that the generated suite reported as clean** — because it mocks
opaque policy functions. See [F-2](docs/FINDINGS.md).

## What we found by measuring

[`docs/FINDINGS.md`](docs/FINDINGS.md) — eight findings, each with a reproduction:

- **`anon` could TRUNCATE every tenant table** on a default Supabase project. RLS does not apply to
  TRUNCATE, so no policy and no policy test could see it.
- **`FORCE ROW LEVEL SECURITY` does not stop the owner** on Supabase — including in the remediation
  the tooling itself recommends.
- **A cross-tenant write is invisible to the attacker**, so a read-based isolation suite structurally
  cannot catch it.
- **Cache Components break every authenticated page** in Next 16 unless the read streams.

Two of the eight were keel's own mistakes. They are published for the same reason as the rest.

## What's in it

Sixteen areas, **Next.js only** — no Nuxt, no SvelteKit, no TanStack Start, no React Native. That is
what makes feature-completeness affordable rather than a slogan: the field maintains the same feature
set across three frameworks, so keel has roughly three times the budget per feature.

Marketing shell · auth (password, magic link, OAuth, passkeys, 2FA, verification, reset, unlock) ·
account · organisations · team & invitations · billing · custom domains · ops & health ·
transactional email · file storage · background jobs · notifications · admin & audited impersonation
· **audit log** · **API keys** · **outbound webhooks**.

**Deliberately not shipped**, with reasons in [`docs/PRODUCT.md`](docs/PRODUCT.md): five payment
providers, a choice of two ORMs, an AI chatbot demo, a CMS. Each is a comparison-table row bought
with permanent maintenance.

The last three in that list are the interesting ones. The field delegates audit logs, webhooks and
SSO to third-party services — a buyer gets integration code and three vendor bills, and the audit
trail lives _outside_ the isolation boundary the product claims. keel builds the three that are
**tenant-isolation surfaces** natively and proves them; delivery infrastructure stays a seam.

## Starting a session

```bash
npm run status
```

**Computed from the repository, never written down.** What is built, what is open, how many
acceptance criteria remain — read from the specs, the registry and the gates themselves.

This exists because the most expensive failure in a long-running project is not a bug: it is reading
a status document, believing it, and rebuilding something that shipped weeks ago. The rule here is
**durable claims are written down; volatile state is computed** — and a gate enforces it, failing the
build when any document asserts a count that has gone stale ([F-23](docs/FINDINGS.md)).

If a document ever disagrees with `npm run status`, the document is wrong.

## Getting started

**Prerequisites:** Node 26 · Docker (for the local Supabase stack) · the
[Supabase CLI](https://supabase.com/docs/guides/cli) · `psql` (the gates query the database
directly) · Python 3.10+ (the policy prober). `npm run check` names any missing one rather than
failing with a stack trace.

```bash
git clone <this repo> && cd keel
npm install
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt   # the policy prober
cp .env.example .env.local                                            # fill from `supabase status`
supabase start
npm run check
```

`npm run check` runs six gates and **reports every failure, not just the first**:

```
✓ typegen    route types are generated
✓ typecheck  types are sound
✓ lint       no lint regressions
✓ unit       pure logic is correct
✓ policy     the database enforces isolation
✓ matrix     the published access matrix is current
```

### Running CI locally

There is no remote yet, so the workflow has never executed on GitHub. `npm run verify` closes as much
of that gap as a laptop honestly can:

```bash
npm run verify           # fast — defers the heavy reinstall
npm run verify -- --full # also runs `npm ci`, exactly as CI does
```

It **parses `.github/workflows/check.yml` and executes its steps**, rather than maintaining a second
list of commands beside it — a hand-written mimic drifts from the workflow the first time either
changes, and then proves the wrong thing confidently.

It is deliberate about fidelity, and reports it. `gitleaks` really scans the full history; `npm run
check` really runs. The GitHub-hosted actions (`checkout`, `setup-node`, `setup-python`,
`setup-cli`, `upload-artifact`) cannot execute on a laptop, so their **effects** are asserted instead
— a Node major that does not match CI's pin is a failure, not a shrug. The summary prints the
percentage genuinely executed and names everything it could not verify:

```
ran      4   executed exactly as CI will
local    1   real local equivalent
asserted 6   effect checked, action not run
skipped  0   NOT verified

fidelity: 45% of steps genuinely executed
```

**45%, stated plainly.** "CI passed locally" is worth nothing if a third of it was quietly skipped.

### Writing application code

[ADR-011](docs/adr/ADR-011-app-router-conventions.md) settles the conventions before the first real
screen sets them by accident. The load-bearing ones:

- **Server Actions for the app, Route Handlers for the outside world.** An action invoked from
  outside the browser breaks the assumptions that make it safe, so anything needing a URL gets
  explicit auth.
- **Every mutation is validate → authorise → act.** A Server Action's argument is untrusted input —
  a network boundary wearing a function's clothes — so it is typed `unknown` and parsed. The type
  annotation you would rather write is a comment.
- **Authorisation is the policy, not an `if`.** Actions use the session-carrying client and let RLS
  refuse. An application check may improve the error message; it is never the boundary. That is
  [F-15](docs/FINDINGS.md), the pattern keel exists to replace.
- **Database types are generated and gated.** A stale row type does not fail to compile — it compiles
  and is `undefined` in production. `npm run generate` regenerates; the `generated` gate fails when
  it drifts.

### Security headers

Six headers — `Referrer-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy`
and both `Cross-Origin-*` — are **enforced unconditionally**. The CSP ships **report-only by
default**, and that is a measured decision, not caution: a production Next build serves 13 inline
scripts, so an enforcing `script-src 'self'` blocks hydration entirely. You can have any two of
{strict CSP, static prerendering, working hydration} — the trilemma and its proof are in
[F-16](docs/FINDINGS.md). `KEEL_SECURITY_HEADERS=on` enforces the CSP once you have tuned it.

The production CSP contains **no `'unsafe-eval'` and no `'unsafe-inline'` in `script-src`**, both
pinned by mutation proofs.

### Environment

Validated at boot, with every problem reported at once. A missing variable fails immediately instead
of becoming the string `"undefined"` three layers away — and any `NEXT_PUBLIC_` variable that looks
like a credential is **refused**, because the bundler inlines those into client JavaScript and serves
them to every visitor ([F-17](docs/FINDINGS.md)).

### Internationalisation

The `[locale]` route segment ships from the first commit, with **one locale**. Not because keel needs
five languages, but because i18n is the one concern that cannot be added later without touching
everything: next-intl's own instructions are _"move all existing layouts and pages into the `[locale]`
segment."_ That cost scales with your screen count, so it is paid here at one page.

Adding a language is a message file and one array entry. A gate fails the build on a missing key, a
misspelled `t('key')`, or a key nobody uses — all three of which otherwise fail silently, in a
language nobody on your team reads. See [ADR-010](docs/adr/ADR-010-internationalisation.md).

### Three commands, three questions

Deliberately not three names for one job — the cost of a wrong answer rises sharply down the list:

| Command             | Question                     | A wrong answer costs                                |
| ------------------- | ---------------------------- | --------------------------------------------------- |
| `npm run check`     | is this code correct?        | a red build                                         |
| `npm run verify`    | will CI pass?                | a round trip, and real CI minutes on a private repo |
| `npm run preflight` | **is this safe to release?** | **an outage, or a tenant leak in production**       |

The third matters most to a team shipping a commercial product on a private repo, and it is the one
no starter ships: _is this migration safe with the old code still running · has the target's schema
drifted from the repository, in either direction · does the access matrix in production still match
the committed one · are the required secrets actually set._ Specified in
[SPEC-016](spec/SPEC-016-release-preflight.md) — **not yet built.**

## How it is built

| Decision                                                       | Where                                                     |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| `organization` as the tenant root; membership as the boundary  | [ADR-001](docs/adr/ADR-001-tenancy-model.md)              |
| Supabase Auth, so policies key off `auth.uid()` with no bridge | [ADR-002](docs/adr/ADR-002-auth.md)                       |
| `supabase-js` for queries, hand-written SQL for policies       | [ADR-003](docs/adr/ADR-003-data-access.md)                |
| Cache Components, tenant-scoped keys                           | [ADR-004](docs/adr/ADR-004-rendering-and-cache.md)        |
| Four test layers; the generated suite cannot judge intent      | [ADR-005](docs/adr/ADR-005-testing.md)                    |
| Stripe bills, the database entitles                            | [ADR-006](docs/adr/ADR-006-billing.md)                    |
| Freshness gate — staleness fails the build                     | [ADR-007](docs/adr/ADR-007-supply-chain-and-freshness.md) |
| Upgradability — a security fix must be able to reach you       | [ADR-008](docs/adr/ADR-008-upgradability.md)              |
| Open core — proof is free, audit evidence is paid              | [ADR-009](docs/adr/ADR-009-open-core-boundary.md)         |

Scope, non-goals and the ten acceptance bars: [`docs/PRODUCT.md`](docs/PRODUCT.md).

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md). Security issues: [`SECURITY.md`](SECURITY.md) — privately, please.
