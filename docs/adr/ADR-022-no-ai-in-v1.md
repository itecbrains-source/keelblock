# ADR-022: No AI feature in v1 — and the position that is not "no AI ever"

**Status:** Accepted · **Date:** 2026-09-09 · **Deciders:** architect

## Context

The question arrived open-endedly: why is the Vercel AI SDK not in this kit? It has been asked
before and answered from memory each time, which is the definition of a decision nobody recorded.
ADR-021 is the precedent — a deliberate refusal, written down so it stops being re-derived.

**Verified state, 2026-09-09.** Nine runtime dependencies: `@supabase/ssr`, `@supabase/supabase-js`,
`next`, `next-intl`, `react`, `react-dom`, `server-only`, `stripe`, `zod`. No AI dependency, no AI
code path, no embeddings table, no vector extension — `pg_extension` has no `vector` row. A reader
who greps will find `openai_api_key` and a `storage.vector` block in `supabase/config.toml`; both are
**Supabase CLI defaults** for Studio's own assistant and object storage, not application surface.

**Verified about the SDK**, from its own manifest rather than a summary: `ai@7.0.97`, `engines:
{node: ">=22"}`, `type: module`, dependencies `@ai-sdk/gateway` / `@ai-sdk/provider` /
`@ai-sdk/provider-utils`, peer dependency `zod` only. **No Vercel-hosting dependency is declared.**
The 7.0 changelog (25 June 2026) confirms Node 22 and ESM-only.

Two claims were offered and are **not** recorded here, because the source given does not support
them: that the SDK is explicitly host-agnostic, and that AI Gateway is optional. The changelog says
neither. The manifest supports the weaker and sufficient version — nothing Vercel-specific is
required to install it — and whether the hosted Gateway is needed in practice was not tested.

## Decision

**keelblock ships no AI feature in v1.** Reasons in ascending force:

1. **The tenancy multiplier.** Every keelblock feature costs policies, intent tests, access-matrix rows
   and schema-guard compliance — call it 1.75×. An AI surface adds provider keys, a vector
   extension, at least one new table and a new reading identity, and every one of those has to be
   **proven** isolated, not merely written.
2. **An AI chat demo is the most commoditised artifact in this market.** Shipping one buys a
   screenshot and spends the budget on the thing that makes this kit indistinguishable.
3. **Removability is the weakest dimension.** F-56 measured what removing a module actually costs
   and found the gates produce the checklist, but SPEC-014 is unbuilt. Adding a module most buyers
   will not want, before any module can be proven cleanly deletable, makes the weakest axis weaker.

## The position, which is not "no AI ever"

This is the half worth recording, because it is the version that is actually keelblock's.

**AI surfaces are the worst tenant-isolation risk in modern SaaS, and nobody in this market proves
isolation there.** Three mechanisms, each the same shape as a defect already in this repository's
findings:

- **Vector similarity search that drops the tenant predicate returns another tenant's documents
  ranked by relevance.** No error, no empty result, plausible output. That is F-1's class — a
  failure invisible to the person being careful.
- **Vector search is conventionally wrapped in a `SECURITY DEFINER` function**, which is precisely
  the RLS-bypass pattern ADR-001's addendum exists to adjudicate and the access matrix exists to
  publish.
- **An agent with tool-calling executes queries as some identity**, so a prompt injected into tenant
  A's uploaded document becomes a cross-tenant read primitive. The boundary gets crossed by text
  rather than by code, which is a category no policy test in this field currently covers.

**And none of it needs new machinery here.** An embeddings table is another row in the access matrix.
`rlsautotest`, the pgTAP intent layer and the mutation proofs apply unchanged. Supabase already ships
pgvector, so there is no infrastructure to add. What that produces is **proof about AI rather than an
AI feature** — and it is a claim no competitor in this category can currently make, because none of
them proves isolation anywhere.

So the ADR refuses the feature and names the future position, and says which is which: **the refusal
is decided; the position is not scheduled.** When it is, it is a spec with a memo, and the memo's
load-bearing question will be whether a vector index can be made to respect a policy without a
definer function.

## Consequences

**Positive:** the dependency list stays at nine, the isolation claim keeps the whole budget, and the
question stops being re-answered from memory. The eventual AI work has a stated shape rather than a
blank page.

**Negative, and real:** a buyer comparing feature matrices will see a row this kit does not fill, and
some of them will stop reading there. That is the cost of the position and it is accepted rather than
argued away — the same trade ADR-021 makes about passwords.

## Adjacent, recorded rather than decided

MakerKit's genuine AI differentiator appears to be that its codebase is legible to coding agents —
an MCP server and agent rules, rather than an end-user feature. `AGENTS.md`, machine-checkable specs,
evaluable deferral triggers and gates that name the file and the line are a stronger version of that
same property, and this repository currently frames all of it as internal discipline rather than as
something a buyer receives. **That is a positioning gap, not a build**, and it is written here so it
is not rediscovered. It is deliberately **not** in the battlecard: the observation about MakerKit
comes from MakerKit's own marketing page, which is a vendor describing its rivals, and it would need
the first-party verification the SSO row got before anyone repeats it.
