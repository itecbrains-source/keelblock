# ADR-007: Supply chain and freshness — the anti-rot mechanism

**Status:** Accepted · **Date:** 2026-09-07 · **Deciders:** architect, security-engineer

## Context

nextacular is the worked example of the failure this ADR prevents: actively maintained through May
2026, CI green throughout, and three Next majors behind with NextAuth 4 and Stripe SDK 10.

A template rots differently from an application, for three reasons that compound:

1. An application has users who force upgrades. A template has nobody.
2. A template is **copied** — every stale copy propagates the rot into a new project and never
   receives the upstream fix.
3. The rot is silent. It builds, the tests pass, nothing complains. You discover it during the week
   you lose after scaffolding.

Renovate and Dependabot are necessary and insufficient: nextacular had CI and rotted anyway.
**Automation proposes; only a gate forces.**

## Decision

**Chosen: a freshness gate with dated, expiring verification stamps**, plus the 2026 supply-chain
baseline.

Three rules, ordered by how hard they are to dodge:

1. **Stamp age** — every pinned major carries the date a human verified it against current. Stamps
   expire (45 days). **Offline and deterministic**, so it cannot be dodged by running without a
   network. This is the "nobody looked" detector and it is the load-bearing rule.
2. **Major drift** — more than one major behind the registry fails. One major of slack is a grace
   period, not a resting place.
3. **Runtime** — the declared Node major must match what the stamp claims was verified.

Offline degrades rule 2 only, and only while rule 1 is green, so "no network" can never become the
permanent excuse.

Supporting measures: `npm ci --ignore-scripts` · **gitleaks** pre-commit *and over full history* ·
Renovate for proposals · a **weekly scheduled clean-clone build** that installs from scratch and runs
the full check, because a template has no users to exercise it and that job is the substitute · npm
**Trusted Publishing (OIDC) with provenance attestations** when `create-keel-app` is published.

## Consequences

**Positive:** staleness is red, not advisory. The gate converts "nobody looked" into a failing build,
which is the only thing that reliably produces looking. A weekly clean build catches the rot no
dependency check can see — that the thing no longer installs on a current runtime.

**Negative:** the gate fails on a schedule whether or not anything is wrong, which is friction by
design and will be tempting to disable. Two mitigations: the window is generous (45 days), and moving
a date is defined as *a claim that you looked* — so the honest cost of a green build is ten minutes of
actually looking, which is the entire point.

**Explicitly rejected:** advisory-only output (`npm outdated` in a log). That is what every rotting
template already has.
