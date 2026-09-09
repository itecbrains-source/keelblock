# ADR-005: Testing — four layers, and the generated suite is not one of the important two

**Status:** Accepted · **Date:** 2026-09-07 · **Deciders:** architect, sdet

## Context

nextacular ships zero tests. Supastarter ships Playwright. Nobody in the field ships proof of tenant
isolation, which is B-2 and the reason keelblock exists.

[`rlsautotest`](https://github.com/unitautogen/rlsautotest) (Apache-2.0) generates a pgTAP suite from
the policy catalog — per table, per command, per identity — plus an access matrix and a CI gate. It is
excellent and should not be rebuilt. **Its own README states the limit that shapes this ADR:**

> _"It proves your database enforces what your policies declare. It cannot know your intent: a wrong
> policy will be faithfully (and greenly) confirmed."_

An exhaustive generated suite over a confidently-wrong policy is a check that cannot fail.

## Decision

**Chosen: four layers**, each answering a different question.

| Layer                | Question                                               | Tool                                   |
| -------------------- | ------------------------------------------------------ | -------------------------------------- |
| Unit                 | Is this pure logic correct?                            | Vitest                                 |
| **Generated policy** | Does the database enforce what the policies _declare_? | `rlsautotest` → pgTAP                  |
| **Intent**           | Are the policies _what we meant_?                      | Hand-written pgTAP, adversarial, small |
| Journey              | Does the real authed flow work end to end?             | Playwright                             |

The two middle layers are not redundant and neither substitutes for the other. The generated layer is
exhaustive and cannot judge; the intent layer judges and cannot be exhaustive. Isolation needs both.

Additionally: **every gate ships a mutation proof** — a test that restores the real defect the gate
exists to catch and asserts the gate goes red. A gate without one has not been shown to be looking at
anything.

## Consequences

**Positive:** B-2 is provable rather than asserted; the access matrix is a publishable artifact and a
genuine differentiator; adopting the generator means the exhaustive half is free and maintained.

**Negative:** a Python dependency in a JavaScript project's CI, and a tool that must never touch
production (it seeds and executes real queries before rolling back). Mitigated by confining it to a
throwaway local/CI database and pinning the version through the freshness gate like anything else.

## Amendment — 2026-09-09: the transfer this ADR implied but never named

The decision above says the generated layer "is exhaustive and cannot judge". F-53 made that
sentence concrete and more serious than it reads, and the sharper form belongs here because it is a
**coverage transfer**, and this repository's rule is that a transfer is named, never assumed.

The generated prober **mocks `is_org_member` and `is_org_admin` to constants** — that is what makes
it exhaustive across identities without a fixture per role. The consequence is not that it judges
badly. It is that for one class of question it **cannot answer at all**: where the security of a
policy depends on _which_ helper it calls, the two helpers are literally indistinguishable to it. A
policy asking "is this caller an admin" and the same policy asking "is this caller a member" produce
an identical generated suite, both green.

So, stated as a transfer:

> **Every policy whose security depends on which membership helper it calls is covered by the intent
> layer alone.** The generated layer contributes nothing to it — not weak evidence, none.

That was true from the first commit and cost nothing until it cost something: the adversarial trial
swapped one helper for the other on `project` DELETE and every layer stayed green, because the only
layer that could have seen it had no rule saying which commands it owed an assertion for.

It does now. `checkAuthorityControls` in `scripts/check-policies.mjs` reads which functions each
policy depends on — from `pg_depend`, the catalog's own answer — and requires the intent run to
carry a passing assertion refusing a **member of the owning organization** for every command that
needs more than membership. The transfer is therefore enforced rather than described, which is the
difference between this amendment and the sentence it sharpens.

**One limit, stated rather than left to be discovered.** The rule derives what is required from the
authority the policy _currently declares_. Downgrade a policy and delete its assertion in the same
change and the rule falls silent, because it now believes the command was always member-level. What
is meant to catch that is `docs/ACCESS-MATRIX.md` — a committed artifact whose diff has to appear in
review (F-26). For that to work the matrix must report what a **real** member can do, and F-54
records that today it does not.
