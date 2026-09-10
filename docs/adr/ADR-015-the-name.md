# ADR-015: The name — keelblock, and how it was checked

**Status:** Accepted · **Date:** 2026-09-08 · **Deciders:** owner, architect

## Context

An adversarial review found that **`keel` is not available**, in the only three places that matter
for a developer tool. (That review was labelled "external" until 2026-09-10; it was a session the
owner ran, and the label is corrected wherever it appears. The finding below is unaffected — it was
verified against the npm registry and RDAP, not taken from the review's word.) The npm package `keel` is live and active, `create-keel-app` is published by someone
else, `keel.dev` resolves, and Keel (keel.so) is a funded developer-tools company selling backends —
the same category, publishing to the same registry.

The consequence is not cosmetic. Bar **B-1**'s headline command is `npx create-keel-app`, which is the
single sentence a user is most likely to type, and it installed an unrelated tool. SPEC-011 could not
be built as written.

The cost of this decision rises every day the old name appears in one more document, so it is taken
now, while it is a find-and-replace, rather than after a package, a domain and backlinks exist.

## 1 · The method, and why the control is the load-bearing part

Availability was checked with **RDAP**, resolving each TLD's authoritative endpoint from IANA's
bootstrap file rather than guessing it:

```bash
curl -s https://data.iana.org/rdap/dns.json   # dev -> https://pubapi.registry.google/rdap/
curl -s -o /dev/null -w "%{http_code}\n" https://pubapi.registry.google/rdap/domain/<name>.dev
curl -s -o /dev/null -w "%{http_code}\n" https://registry.npmjs.org/<name>
```

**Every negative was preceded by a positive control**, and this is not ceremony. An earlier attempt at
this used a plausible-looking endpoint that returns 404 for _every_ query, including `web.dev` — which
would have reported a dozen registered domains as free, inside a document recommending a rename. A
lookup that cannot distinguish "free" from "I am not the right server" is not evidence.

## 2 · What was checked, and when

Re-verified on 2026-09-08 against the endpoints above. `200` = registered/taken, `404` = free.

| Query                          | Result | Reading                                      |
| ------------------------------ | ------ | -------------------------------------------- |
| `web.dev`                      | 200    | **control** — the .dev endpoint answers      |
| `google.com`                   | 200    | **control** — the .com endpoint answers      |
| `keel.dev`                     | 200    | taken                                        |
| npm `keel`                     | 200    | taken — v0.478.0, published 2026-09-07       |
| npm `create-keel-app`          | 200    | taken                                        |
| **`keelblock.dev`**            | 404    | **free**                                     |
| **npm `keelblock`**            | 404    | **free**                                     |
| **npm `create-keelblock-app`** | 404    | **free**                                     |
| `keelblock.com`                | 200    | taken — parked, and deliberately not pursued |
| `skeg.dev` / npm `skeg`        | 404    | free — the runner-up, see below              |

The wider sweep that established _why_ single dictionary words are exhausted — eight short nautical
words registered during 2026, in one-year terms, at the registrars speculators use — is recorded in
`docs/review/03-POSITIONING.md`. This ADR asserts only the rows above, which were reproduced here.

## 3 · Decision

**The project is `keelblock`, on `keelblock.dev`.** The npm names `keelblock` and
`create-keelblock-app` are claimed alongside it.

The meaning is apt rather than merely free: a keel block is the timber a hull rests on in dry dock —
**the thing that holds a vessel up while it is being inspected.** For a project whose product is the
inspection, that is a better fit than the original.

## 4 · What was rejected

| Option                                  | Why not                                                                                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Keep `keel`**                         | Every search, every recommendation and every AI answer about "keel" resolves to a funded company in the same category. That is unwinnable, and it gets more expensive monthly.                                |
| **`skeg`**                              | Genuinely clean and shorter. Rejected on meaning: a skeg holds a hull _on course_, which describes steering rather than proof. It stays the fallback if `keelblock.dev` is lost before registration.          |
| **A scoped package** (`@keelblock/...`) | The strategy in the review is that the proof harness ships first, as an installable package run against an existing database. The bare name is the one that matters there, and a scope reads as a workaround. |
| **Bare-word `.com`**                    | `keelblock.com` is parked, and modern developer tools do not use bare-word `.com`. Optimizing for it would have eliminated every remaining candidate.                                                         |
| **`carvel`**                            | Considered and rejected before `keelblock`: the meaning is close to perfect, and `carvel.dev` is the Kubernetes Carvel project. The same collision as `keel`, in the same category.                           |

## Consequences

**The names are not yet registered.** This ADR records a decision, not a purchase, and stating
otherwise would be the kind of unbacked claim the repository exists to catch. Registration is tracked
as **DEF-013** with a dated trigger, so it fails the build rather than waiting quietly.

`supabase/config.toml`'s `project_id` changed, so `supabase start` provisions a **new** local stack;
the containers named `supabase_*_keel` belong to the old one and can be removed once nothing needs
them. No migration, policy or test changed.

`docs/review/` deliberately keeps the old name. It is a dated external record whose subject is that
`keel` is taken, and rewriting it would falsify the finding.
