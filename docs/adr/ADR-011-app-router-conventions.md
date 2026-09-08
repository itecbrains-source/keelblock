# ADR-011: App Router conventions

**Status:** Accepted · **Date:** 2026-09-07 · **Deciders:** architect · **Closes** DEF-007

## Context

keelblock has a proven database layer and almost no application layer. The next spec writes the first real
UI, and **conventions get set by whatever the first screen happens to do** — so they are decided here
instead, once, while there is nothing to migrate.

This matters more than usual because of what keelblock claims. Isolation is enforced in Postgres, but the
application can still route around it: one Server Action reaching for the service-role client
bypasses every policy, and no test in this repository would notice. The conventions below exist to
make the safe path the obvious one.

## Decisions

### 1 · Server Actions for the app; Route Handlers for the outside world

|                   | Use                                                          | Why                                                                                                                              |
| ----------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Server Action** | every mutation the browser initiates                         | CSRF handled by the framework, no endpoint to name, secure and version-free by default, and it lives beside the UI that calls it |
| **Route Handler** | webhooks, third-party callbacks, a public API, health checks | anything with a caller that is not this app needs a stable URL, its own authentication, and rate limiting                        |

The failure this prevents is mixing them: **a Server Action invoked from outside the browser breaks
the assumptions that make it safe**, so if something needs a URL it is a Route Handler with explicit
auth, not an action that happens to be reachable.

### 2 · Every mutation is validate → authorize → act, in that order

```ts
'use server';
export async function renameOrganization(input: unknown) {
  const { id, name } = renameSchema.parse(input);      // 1 · never trust the client
  const supabase = await createClient();               // 2 · the user's session, so RLS applies
  const { error } = await supabase                     // 3 · the policy is the authority
    .from('organization').update({ name }).eq('id', id);
  ...
}
```

**A Server Action's argument is untrusted input.** It is a network boundary wearing a function's
clothes, and the type annotation on it is a comment — the runtime receives whatever was posted. So
the parameter is typed `unknown` and parsed, never typed as the shape you hope for.

**Authorization is the policy, not an `if`.** The action uses the session-carrying client and lets
RLS refuse. An application-level check may be added for a better error message, never as the
boundary — that is F-15, the pattern keelblock exists to replace.

### 3 · The service-role client is never reachable from a component tree

It bypasses RLS entirely. It belongs to webhooks, scheduled jobs and administrative tooling, lives
under `server-only/`, and every call site carries a one-line justification. A gate enforces the
import boundary (SPEC-003 REQ-3), because this is the one mistake that silently voids every guarantee
keelblock makes.

### 4 · Actions return typed results; they do not throw for expected failures

```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
```

A thrown error crosses the boundary as a generic message in production and a stack trace in
development, so the user gets nothing useful and the developer gets too much. Expected failures — a
taken slug, a denied permission — are values. Genuine faults still throw and reach `error.tsx`.

### 5 · Server Components fetch; Client Components receive

Data is read in Server Components and passed down. `'use client'` appears as far down the tree as
possible, on the component that actually needs interactivity. A client component never talks to the
database directly.

Any component reading cookies sits inside `<Suspense>` — not a style preference but a build
requirement under Cache Components (ADR-004), which is why _loading_ is a designed state rather than
an afterthought.

### 6 · Database types are generated, committed, and checked for staleness

Hand-written row types drift from the schema silently, and the first symptom is a runtime `undefined`
in production. Types are generated from the database, committed, and a gate fails when they no longer
match — the same argument as the access matrix, applied to shape rather than permission.

### 7 · Structure is by layer, not by feature

```
src/app/[locale]/…   routes, layouts, and the Server Actions beside them
src/lib/…            pure logic and I/O boundaries — the part that is unit-tested
src/components/…     presentational, no data access
```

Feature folders are better for large teams and worse for a starter: a reader looking for "where does
validation live" should find one answer, not one per feature.

## Consequences

**Positive:** the safe path is the shortest path. Reaching for the service-role client, or hand-rolling
an authorization check, becomes visibly unusual rather than a reasonable-looking alternative.

**Negative:** `Result<T>` is more ceremony than throwing, and typing action parameters `unknown` costs
a parse at every entry point. Both are accepted deliberately — they are the price of a boundary that
is a boundary rather than a convention.
