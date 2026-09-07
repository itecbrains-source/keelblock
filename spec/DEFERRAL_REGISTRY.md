# Deferral registry

The single registry of work deliberately **not built**, each with a reason and a **machine-evaluable
trigger**. `npm run check` reads this file.

**Rule 0 — a deferral is scope you chose not to build. A defect is never a deferral.** If you broke
it, you fix it in the change that broke it. Filing your own breakage here and merging as "done" is
the one behaviour this registry exists to prevent.

**Keep it thin.** A registry that grows to hundreds of rows stops being read, and then it is a place
debt goes to be forgotten rather than tracked. If this list is longer than the feature set, the
discipline has failed its own purpose.

## How a trigger works

A trigger is evaluated on every `check`. **When it fires, the build fails** — that is the whole
mechanism. A deferral whose moment has arrived cannot sit quietly in a file; it must be built,
closed, or its trigger deliberately restated with a reason.

| Trigger | Fires when | Use for |
|---|---|---|
| `file-exists:<path>` | the path appears in the repository | "when we have X" |
| `env-set:<NAME>` | the environment variable is set | "when we have credentials for X" |
| `spec-done:<SPEC-NNN>` | that spec's status becomes `done` | "after X ships" |
| `date:<YYYY-MM-DD>` | the date passes | a dated commitment |
| `decided:<token>` | never automatically — a human records the decision | a genuine judgement call |

`decided:` never fires on its own, so it is the honest choice when nothing observable marks the
moment — and it is the one to be suspicious of, because it is also the easiest place to hide
something indefinitely.

## Open

| id | title | reason | trigger |
|---|---|---|---|
| DEF-001 | Deploy topology for keel itself | keel has no environments of its own. Every SPEC-016 preflight check takes a **named target** rather than keel inventing a deployment story for its users — a topology ADR written now would be recording a choice nobody has made. When keel gains a real deployment (a demo, or its own site), that decision becomes an ADR: which environments exist, how migrations reach each one, and what "released" means. | `file-exists:.github/workflows/deploy.yml` |
| DEF-002 | Journey test layer (Playwright) | The fourth test layer in ADR-005 needs an authenticated flow to drive, and authentication is not built. Writing browser tests against a login page that does not exist would produce tests that pin nothing. When built: **accessible locators only** (SPEC-002 REQ-3b) and page objects behind Playwright fixtures — both settled in advance, because retrofitting locators across a written suite never happens. | `spec-done:SPEC-004` |
| DEF-005 | Enterprise surface — SSO/SAML, SCIM directory sync, audit logs, API keys, webhooks | A B2B security review asks for these, so they are a real gap rather than a non-goal (see `docs/PRODUCT.md`). Deferred on ordering, not doubt: a kit with SSO and no provable isolation is what the field already offers, and keel's differentiator has to exist before its table stakes. When built, the pattern is **delegate, not implement** — an audit-log implementation inside a starter is a liability nobody maintains. | `decided:enterprise_tier` |
| DEF-004 | Supabase clients are written but wired to nothing | `src/lib/supabase/{client,server,server-only/admin}.ts` exist and are imported by no production code — orphans by this project's own no-orphan-stubs rule. They are the substrate SPEC-004 (auth) consumes, and deleting them to re-add them a week later is churn rather than discipline. `knip` is exempted for that path, with the reason recorded in `knip.reasons.md`. | `spec-done:SPEC-004` |
| DEF-003 | CI executed on a real remote | The workflow is structurally asserted by 12 tests and run locally by `npm run verify` at ~45% fidelity, but **has never executed on GitHub**. Under the project's own rule, an unrun workflow is a file, not a working gate. This closes on the first push to a remote. | `decided:remote_created` |

## Closed

_None yet._
