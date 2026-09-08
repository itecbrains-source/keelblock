# Your Server Actions are public endpoints, and a page-level check does not cover them

**2026-09-08 · a gate, and the two ways we got it wrong first**

Next.js documents this and it is worth reading twice before reading anything else:

> By default, when a Server Action is created and exported, it is reachable via a direct POST
> request, not just through your application's UI. This means, even if a Server Action or utility
> function is not imported elsewhere in your code, it can still be called externally.

And:

> A page-level authentication check does not extend to the Server Actions defined within it. Always
> re-verify inside the action.

Both sentences are from Next's own data-security guide. Neither is a criticism of the framework —
they are an accurate description of what a Server Action is: a POST endpoint that happens to be
written as a function. Next mitigates it with encrypted action ids and dead-code elimination, and is
careful about what that buys, saying the mitigation reduces risk _"in cases where an authentication
layer is missing"_. A mitigation, not a boundary.

So the question for any codebase built this way is not _do we check?_ It is: **what happens the day
someone adds an action and forgets?**

## Why "we're careful" is the wrong answer

The clearest illustration in the category is not hypothetical. BoxyHQ's `saas-starter-kit` is the
most-starred free kit of its kind, 4,928 stars, Apache-2.0, and genuinely well built. Its isolation
works like this:

```ts
// models/apiKey.ts — fetch by id, unscoped
export const getApiKeyById = async (id: string) =>
  prisma.apiKey.findUnique({ where: { id }, select: { id: true, teamId: true } });

// lib/guards/team-apiKey.ts — then compare, in application code
export const throwIfNoAccessToApiKey = async (apiKeyId: string, teamId: string) => {
  const apiKey = await getApiKeyById(apiKeyId);
  if (teamId !== apiKey.teamId) throw new ApiError(403, '…');
};
```

Read the order rather than the code. The row — _any_ tenant's row, by id alone — is fetched first,
and a separate function that the route must remember to call compares the tenant afterwards. By the
time the comparison happens, another tenant's data is in the process, in memory, and in the log if
anything logs the query.

That is not sloppiness. It is the ceiling of the architecture: `grep -r "create policy"` across
their schema returns zero matches, so application code is the only thing that can refuse. And the
thing about a step you must remember is that the failure mode is _forgetting_, which no amount of
care removes and no code review reliably catches on a Friday.

## The rule

An exported Server Action must reach an authorization call, or be listed as deliberately public with
a written reason. Not a convention — a check that fails the build and names the action:

```
src/app/[locale]/settings/actions.ts: Server Action `deleteProject` never reaches an authorization
call. An exported action is a public POST endpoint whether or not any UI calls it, and a page-level
check does not extend to it. Call getCurrentUser, or declare it in PUBLIC_ACTIONS with a reason.
```

Two design choices did the work.

**Deny by default, with a visible opt-out.** The two sign-in actions genuinely must not require a
session — requiring one to request one is a contradiction. They are on an allowlist, each with a
reason, and the list is compared **by value** in a test rather than capped by length. A cap permits
swapping any member for any other, which is how an allowlist loses a guarantee without ever growing.

**Follow the module graph, not the function body.** An action that delegates to a data-access
function which authorizes is correct, and demanding the call be literally inline would train people
to satisfy the gate rather than the property.

## The two ways we got it wrong

Publishing only the rule would be publishing the marketing version. Both mistakes are more useful
than the finished thing.

**It was per file, and that made it able to stop failing.** The first implementation asked whether
the _module_ reached an authorizer. It passed. Then a `signOut` action — which legitimately reads the
caller — landed in the same file as the two unauthenticated sign-in actions, and suddenly all three
looked authorized. The rule had quietly become "does this file contain any authorization anywhere",
which any growing file eventually satisfies.

What caught it was not review. It was one assertion inside the rule's own test:

```ts
// Non-vacuous: emptying the allowlist must produce findings, or the rule inspected nothing.
expect(findUnauthorizedActions(files, read, resolve, []).length).toBeGreaterThan(0);
```

Empty the allowlist and the gate must complain. When it stopped complaining, the rule had stopped
looking. That assertion cost one line and found a real defect in under an hour.

**And a sibling check in the same repository had been dead its whole life.** A rule meant to catch a
spec's status disagreeing between two files matched its table row with `line.includes('| SPEC-004 |')`
— single spaces. The formatter pads those tables, so the real line reads
`| SPEC-004                               |`. It matched nothing, for every spec, always, and a
not-found row was a silent skip. Its own mutation proof passed, because the proof's fixture was an
unpadded row. The test asserting the real file passes was satisfied by finding nothing at all.

The general shape, and it is the one worth keeping: **a check that cannot fail is indistinguishable
from a check that passes.** The only defence we have found is to make every rule prove it can go red
against the real artifact, not a fixture — and to assert that it is still looking at something.

## What this does not claim

It does not claim your data is safe because actions authorize. Row-level security is what refuses
the row here; this rule is the second layer, and it exists because the first one can be bypassed by
anything holding a privileged connection.

It does not claim the field is careless. It claims their architecture has no place to put this check,
and ours does — which is a statement about structure, and checkable either way.

---

_The rule is [`scripts/check-boundaries.mjs`](https://github.com/itecbrains-source/keelblock/blob/main/scripts/check-boundaries.mjs);
its proofs, including the two failures above, are in the test file beside it. The spec is
[SPEC-004](https://github.com/itecbrains-source/keelblock/blob/main/spec/SPEC-004-auth.md)._
