# ADR-005: Testing — four layers, and the generated suite is not one of the important two

**Status:** Accepted · **Date:** 2026-09-07 · **Deciders:** architect, sdet

## Context

nextacular ships zero tests. Supastarter ships Playwright. Nobody in the field ships proof of tenant
isolation, which is B-2 and the reason keel exists.

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
