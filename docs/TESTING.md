# Testing

Four layers. Each proves something the others cannot, and each is honest about what it does not see.

| Layer                                 | Answers                                             | Cannot see                                                                 |
| ------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| **unit** (`vitest`)                   | is this function correct?                           | anything about the database, and anything about a real HTTP response       |
| **generated** (`rlsautotest` → pgTAP) | does every policy DELEGATE as declared?             | **every line inside the helper it delegates to** — the tool says so itself |
| **intent** (hand-written pgTAP)       | is the policy WHAT WE MEANT?                        | whether the application ever calls it                                      |
| **journey** (Playwright)              | does the real authenticated flow work in a browser? | anything not on a path a person walks                                      |

The boundary between the middle two is the one that matters and it was measured, not assumed: the
generated suite reported a **total cross-tenant leak as green**, because it verifies wiring and
mocks the helper (F-2). keelblock puts the membership predicate inside exactly such a helper, so the
intent layer is the only thing testing the predicate at all.

## Running them

```bash
npm run check      # everything except the journey layer
npm run journey    # the journey layer, against a built app and the local stack
```

`check` runs the journey layer in CI but not locally, for one reason: it builds the application
first, which takes longer than every other gate combined. Locally you run it when you have changed
something a person touches.

## The journey layer

**It exists because of [F-38](FINDINGS.md).** A unit test asserted that the protected page calls
`getCurrentUser` and redirects. It passed, correctly, and could not see that the HTTP status was
`200` and the page chrome was served — because under Cache Components the shell is prerendered and
flushed before session-dependent code runs. Three green layers, and the fourth is what noticed.

Two rules, both settled before the first test was written:

**Accessible locators only** — `getByRole`, `getByLabel`, `getByPlaceholder`. Never a CSS selector,
never a test id (SPEC-002 REQ-3b). Adopted from `boxyhq/saas-starter-kit`, whose suite does this
throughout. The payoff: a control that loses its accessible name breaks a test, so the suite is an
accessibility regression test for everything it touches, and bar B-7 is partly held by tests written
for another reason.

**The fixture owns its data, and cannot reach anything that matters.** It refuses to run against a
non-loopback database before writing a row — because the SPEC-005 walk was once done by hand against
the development stack, left two organizations and fourteen users behind, and broke the policy gate's
mutation proof, which counts rows.

It also seeds **through the product's own paths**, as ordinary users. The first version reached for
`service_role` and was refused `42501`: migration `20260908150000` deliberately revoked everything
from that role, because _"a grant to it is a deliberate act tied to a real consumer."_ Granting it so
a fixture could seed would arm the most powerful role in the system for a test. So the fixture states
only what a test genuinely chooses — how many people, how many organizations, and labels the
assertions look for — and everything else is computed by the thing under test: identifiers by the
database, the owner membership by `create_organization`, the invariants by their triggers.

## What a timed local run looks like

Recorded 2026-09-08, on the machine that wrote this, against the built application and a warm stack:

```
npm run check      ~35s   every gate, including 81 pgTAP assertions across 9 files
npm run journey    ~17s   7 tests, one of which spends an auth email
```

The journey number excludes `next build`, which the Playwright web server runs first and which
dominates a cold run at roughly 20 seconds.

**One test can skip, and says why.** Supabase caps auth email at two per hour project-wide
(DEF-019), so the one journey that signs in through the form — rather than by injecting a session —
skips when the quota is spent, naming the count it saw. CI starts a fresh stack, so it never skips
there.
