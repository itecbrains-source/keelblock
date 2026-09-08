# ADR-008: Upgradability — the structural failure of the whole category

**Status:** Accepted · **Date:** 2026-09-07 · **Deciders:** owner, architect

## Context

Every starter kit — free and paid alike — has the same terminal flaw: **the product is a copy.** You
clone it in March, make it yours, and are forked off maintenance forever. In September upstream fixes
an isolation bug in a policy, and there is no path from their fix to your repository. MakerKit,
Supastarter, ShipFast and Achromatic all share this, and none advertises a solution, because at the
"clone it" level there isn't one.

This matters more for keelblock than for any of them. Keelblock's entire claim is security-shaped, and a
security fix that cannot reach the people who need it is not a fix — it is a changelog entry.

## Decision Drivers

- A stated non-goal is **"not a framework"**: it must be your code from the first commit, so the
  obvious fix (put the core in an npm package) is disallowed.
- Security fixes must reach existing projects; cosmetic changes need not.
- Whatever path exists must be **proven in CI**, not documented and hoped for — an untested upgrade
  path is exactly the kind of promise B-4 exists to forbid.

## Options Considered

### Option A: keelblock core as an npm dependency

| Pros                              | Cons                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm update` and you have the fix | It becomes a framework you fight — the top-three complaint about kits, and a stated non-goal |

### Option B: `git remote upstream` + merge, documented

| Pros                   | Cons                                                                   |
| ---------------------- | ---------------------------------------------------------------------- |
| Zero machinery; honest | Conflicts everywhere the user worked; in practice nobody does it twice |

### Option C: Structure so the security surface is the part users do not edit, plus codemods

| Pros                                                                                        | Cons                                                              |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Fits "it's your code"; most security fixes land where conflicts are structurally impossible | Requires discipline about what lives where, from the first commit |

## Decision

**Chosen: Option C**, resting on an observation about _where_ security fixes actually land.

Keelblock's security-critical surface is small, stable, and mostly **append-only by nature**:

- **Policies are migrations.** A fixed policy ships as a _new_ migration file. New files never
  conflict — a project pulls it in and applies it, however much it has diverged. The single most
  important class of fix is conflict-free by construction.
- **The service-role boundary, auth helpers, webhook handler and gates** are files users rarely touch,
  because there is no product reason to.
- **Product surfaces** — pages, components, business logic — are where users work and where conflicts
  would happen, and they are almost never where a security fix lands.

So keelblock is structured to keep those two sets apart, and ships:

1. **`keelblock upgrade`** — fetches the release, applies new migrations, runs codemods for mechanical
   changes, and reports anything needing hands rather than pretending it merged.
2. **Codemods for every breaking change**, in the release, the way Next.js does it.
3. **GitHub Security Advisories** for the isolation-affecting class, so it arrives as a notification
   rather than requiring the user to be watching.
4. **A CI job that proves the path** (B-10): scaffold at the previous tag, apply the upgrade, run the
   _current_ suite. If that job is red, the release does not ship.

## Consequences

**Positive:** the category's deepest flaw gets an actual answer, and it is the answer most worth
having for a security-shaped product. The file-layout discipline it demands is good for
comprehensibility anyway.

**Negative:** it constrains layout from commit one — a product surface that grows security-critical
logic breaks the model quietly. Mitigated by a gate over the boundary (the same one ADR-003 needs for
the service-role client), and by accepting that the path is **best-effort for product code and
guaranteed only for the security surface**. That limit is stated plainly in the docs rather than
discovered: promising a clean upgrade for code the user rewrote would be the kind of claim keelblock exists
to not make.

## Addendum, 2026-09-08 — the load-bearing claim was wrong, and the correction is small

This ADR chose Option C on one empirical claim, quoted here before it is corrected:

> "Policies are migrations. A fixed policy ships as a _new_ migration file. **New files never
> conflict** — a project pulls it in and applies it, however much it has diverged."

The first time it was tested (F-45) the buyer's project answered:

```
Found local migration files to be inserted before the last migration on remote database.
```

True about text, false about behaviour. The file conflicts with nothing and the CLI refuses it anyway,
because its version sorts **before** the buyer's last applied migration — the ordinary case, since the
buyer kept working after they cloned. `--include-all` applies it and the fix genuinely lands, so
Option C survives; but it survives with an instruction attached, not by construction, and that
distinction is the difference between a design and a hope.

Two things this ADR did not consider, both measured in the same run:

- **Generated artifacts belong to neither side.** `database.types.ts` and the access matrix describe
  the BUYER's schema. Upstream's copies name tables the buyer does not have and omit tables the buyer
  wrote. They are regenerated locally and never delivered.
- **B-10's bar contradicted this ADR's own policy** (F-46). "Security fixes must reach existing
  projects; cosmetic changes need not" cannot coexist with "runs the current suite green", because
  the current suite tests the features a selective adopter skipped. Settled in SPEC-013: **schema is
  cumulative and adopted whole; product code is the buyer's and is never touched.**

The file-layout discipline this ADR demands is now written down as code rather than intention —
`UPSTREAM_OWNED` in `scripts/upgrade.mjs`, with a mutation proof that an upgrade never takes a path
under `src/`.
