# Authorization

Where the decision is made, why it is made there, and what the build refuses.

## The short version

**Authorization happens in the Data Access Layer.** Not in the proxy, not in a page, not in a layout.
Every read and every write asks `getCurrentUser()` before it touches data, and the database refuses
anything the policy does not permit even if that call is forgotten.

Three layers, in the order they refuse:

| Layer                 | Refuses                               | If it is bypassed                             |
| --------------------- | ------------------------------------- | --------------------------------------------- |
| Row-level security    | the row itself, inside the query plan | nothing else can save you — this is the claim |
| The Data Access Layer | the request, before a query is built  | RLS still refuses the row                     |
| `boundaries` gate     | the _code_, at build time             | the two above still hold at runtime           |

The gate is not a security control. It is what stops the second layer quietly eroding.

## Why not the proxy

`src/proxy.ts` refreshes the session and sets security headers. It decides nothing, deliberately.

Next.js renamed `middleware` to `proxy` in 16.0 and explained why: the name _"implies a network
boundary in front of the app"_, and it recommends avoiding reliance on this layer _"unless no other
options exist"_. A network boundary in front of the app is not an authorization boundary, and
[GHSA-f82v-jwr5-mffw](https://github.com/vercel/next.js/security/advisories/GHSA-f82v-jwr5-mffw)
(CVSS 9.1) is what that costs when it is the only check — _"It is possible to bypass authorization
checks within a Next.js application, if the authorization check occurs in middleware."_

The advisory's last line is the one to keep: _"Next.js deployments hosted on Vercel are automatically
protected against this vulnerability."_ If you self-host, or put your own CDN in front, you do not
inherit that. A model that is safe because of where it happens to be deployed is not a model.

There is a second reason, specific to Server Actions and documented by Next:

> Server Functions are not separate routes in this chain… a Proxy matcher that excludes a path will
> also skip Server Function calls on that path. A matcher change or a refactor that moves a Server
> Function to a different route can silently remove Proxy coverage.

Coverage a file move can delete is not a boundary.

## Verifying identity

Use `getClaims()`. It validates the JWT signature against the project's published keys on every call.

`getSession()` is never used for identity — Supabase is explicit that it _"isn't guaranteed to
revalidate the Auth token"_. It stays legitimate for reading the tokens themselves, and a test
asserts that no file in `src/` calls it at all, which is a stronger rule than needed while nothing
requires the raw tokens. When something does, that test is where the decision gets made, visibly.

```ts
import { getCurrentUser } from '@/lib/auth/dal';

const user = await getCurrentUser(); // verified, cached per request, or null
```

It is wrapped in React's `cache`, so calling it in every action and every read costs one verification
per request. That is what makes "just call it every time" affordable, instead of passing a user object
down through components and hoping nobody hands it to a client.

## Writing a Server Action

```ts
'use server';

import { getCurrentUser } from '@/lib/auth/dal';

export async function renameProject(formData: unknown) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Unauthorized');

  if (!(formData instanceof FormData)) throw new Error('Invalid');
  const parsed = RenameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error('Invalid');

  // RLS scopes this to what the caller may write. The check above is defence in depth,
  // not the boundary.
  await db.from('project').update({ name: parsed.data.name }).eq('id', parsed.data.id);
}
```

Three things, in order: **authorize, validate, act.** The argument is typed `unknown` and parsed,
because an exported action is reachable by direct POST whether or not any UI calls it.

Forget the first step and the build fails with the action named. Forget it _and_ disable the gate and
row-level security still refuses the row — which is the point of having three layers rather than a
better first one.

## Deliberately public actions

Sign-in cannot require a session. Those actions are declared in `PUBLIC_ACTIONS` in
`scripts/check-boundaries.mjs`, each with a reason, and the list is compared by value in a test — a
length cap would permit swapping one entry for another, which is how an allowlist loses a guarantee
without ever growing.

If you are adding to that list, the question to answer in the reason is not _does this need a
session?_ but _what can an unauthenticated caller do by POSTing to it a thousand times?_

## Sessions and cookies

A response that sets an auth cookie must not be cacheable. `@supabase/ssr` supplies the headers as
the second argument to `setAll`, and its own types say why: otherwise _"one user's session token can
be served to a different user."_

Two clients, and which one you need depends on whether you hold a response:

- **`response-client.ts`** — the proxy and the auth callback. Answers a GET, holds a `NextResponse`,
  applies cookies **and** headers. Constructed per request; the library warns that a reused client
  leaves later responses without the headers.
- **`server.ts`** — Server Components and Server Actions. A Server Component cannot write cookies at
  all; a Server Action answers an uncacheable POST and has no response object. It writes cookies and
  is recorded as the single exemption in the gate, with the measurement behind it in
  [F-34](FINDINGS.md).

If you add a third path that writes auth cookies on a GET, use the response-bound client. The gate
will tell you if you do not.

## What the gate checks, and what it does not

**Checks:** that every exported Server Action reaches `getCurrentUser()` — through the module graph,
per action, not per file — or is on the public list. That every `setAll` outside the recorded
exemption takes and reads its headers argument. That no rendered entry point can reach the
service-role client, resolved through imports rather than by filename.

**Does not check:** that your authorization is _correct_. It cannot know that a manager may edit a
project and a member may not — that is policy, and it belongs in RLS where it is tested by pgTAP.
The gate ensures the question gets asked; the database decides the answer.
