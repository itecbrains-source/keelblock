# SPEC-004: Authentication

> Status: `partial` · Research: [`research/07-AUTH-2026.md`](../research/07-AUTH-2026.md) · ADRs: [002](../docs/adr/ADR-002-auth.md), [011](../docs/adr/ADR-011-app-router-conventions.md)
> Contracts: SPEC-001, SPEC-002, SPEC-003 ·

## Intent

Give the database a caller. SPEC-001 made isolation a property of Postgres, and every policy it
wrote keys off `auth.uid()` — which is null until something signs a user in. Until then the proof
apparatus is proving a claim about an empty building.

So this spec is narrower than it sounds and more load-bearing than it looks. It does not decide who
may do what — that is the role model, already built, and the organization surfaces that come after.
It decides **how a request acquires an identity, where that identity is checked, and which of those
answers are written down rather than inherited.**

The governing rule is [F-31](../docs/FINDINGS.md): _if a security property is true because of a
default you did not set, it is not a property, it is a version of somebody else's image._ The
research memo found that rule running through this entire surface — a framework layer that a header
could once walk past, a cookie whose cacheability the library sets and the caller can silently drop,
and an `[auth]` configuration block in this repository that is the CLI's generated file, unedited,
governing nothing but a laptop.

## Scope / non-scope

- **In scope:** the sign-in methods (magic link and OAuth, both through PKCE) · the callback route
  and its redirect validation · session refresh and the cookie contract · sign-out · where
  authorization is decided and the assertion that it is decided there for every entry point ·
  route-protection coverage · the auth configuration as a reviewed, version-controlled artifact ·
  auth email delivery.
- **Out of scope, and named so each is a decision:**
  - **Organizations, roles and membership surfaces** — SPEC-005. This spec ends at "there is a
    `auth.uid()`"; what it may reach is already policy.
  - **Invitations** — SPEC-006, deliberately its own spec per ADR-002, because accept/decline/join/
    revoke/role-change is where a tenancy model usually leaks.
  - **SSO and SCIM** — DEF-005, blocked on having an identity provider to test against.
  - **Per-account lockout, disposable-email blocking, bot check** — DEF-006, already filed with the
    right reasoning: Supabase's rate limits are per-IP, and rotating IPs defeats them. This spec
    creates the login those measures protect and does not pre-empt them.
  - **MFA and leaked-password protection** — DEF-017. Both are Supabase Pro-plan features, so the
    constraint is commercial rather than technical, and promising either on a free-tier install
    would be the marketing-claim honesty rule broken about a security control.
  - **Audit log** — SPEC-025. Sign-in events belong in it; it does not exist yet, and building half
    of it here would put the tenant-isolated half somewhere nobody looks.

## Sources of truth

- `docs/PRODUCT.md`
- `docs/adr/ADR-002-auth.md`
- `docs/adr/ADR-011-app-router-conventions.md`
- `research/07-AUTH-2026.md`
- `docs/FINDINGS.md` — F-31, which is the shape of half the requirements below
- `supabase/config.toml` — the `[auth]` block, currently the generated default
- `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts` — the substrate, written and wired to
  nothing (DEF-004)

## Requirements

### REQ-1 — authorization is decided in the Data Access Layer; the proxy only refreshes

The proxy refreshes the session and applies the cookies. **It does not decide anything.** Every read
and every mutation authorizes at the point it touches data, in a `server-only` module.

This is both vendors' own advice, arrived at independently. Supabase: _"the server function is the
only checkpoint that always runs, so it must call `supabase.auth.getClaims()` to authorize the
request itself."_ Next.js, on renaming middleware to proxy: _"We recommend users avoid relying on
Middleware unless no other options exist"_ — the term proxy being chosen precisely because it
_"implies a network boundary in front of the app"_, which is not an authorization boundary.

The failure is not hypothetical and not only historical. [GHSA-f82v-jwr5-mffw](https://github.com/vercel/next.js/security/advisories/GHSA-f82v-jwr5-mffw)
(CVSS 9.1) was exactly this: _"It is possible to bypass authorization checks within a Next.js
application, if the authorization check occurs in middleware."_ This repository is on a version long
past the patch, so the CVE is not live here and the spec does not pretend otherwise. **The sentence
worth keeping is the advisory's last one:** _"Next.js deployments hosted on Vercel are automatically
protected against this vulnerability."_ A keelblock buyer who self-hosts, or fronts the app with a
CDN of their own, does not inherit that. An authorization model that is safe because of where it
happens to be deployed is F-31 with a hostname.

The file is renamed `middleware.ts` → `proxy.ts` in the same change, using the framework's codemod.
Not cosmetic: it is the deprecated convention on the Next.js version this repository pins, and every
current guide is written against the new one.

### REQ-2 — identity is verified with `getClaims()`, and `getSession()`'s user is never an input to a decision

_"Never trust `supabase.auth.getSession()` inside server code… It isn't guaranteed to revalidate the
Auth token."_ _"It's safe to trust `getClaims()` because it validates the JWT signature against the
project's published public keys every time."_

`getSession()` remains legitimate for one thing — reading the tokens themselves. So the requirement
is not "never call it", which would be unenforceable and would train people to work around the
check; it is that **no authorization path reads a user identity from it.** That distinction is what
makes this mechanically checkable rather than a review habit.

### REQ-3 — every Server Action re-verifies its caller

_"By default, when a Server Action is created and exported, it is reachable via a direct POST
request, not just through your application's UI."_ _"A page-level authentication check does not
extend to the Server Actions defined within it."_

Next.js encrypts action ids and eliminates unused actions, and is explicit about what that buys:
it _"reduces the risk in cases where an authentication layer is missing"_ — a mitigation, not a
boundary.

ADR-011 makes every mutation a Server Action, _"a network boundary wearing a function's clothes"_.
That sentence is now a requirement with a test behind it: **an exported action that reaches a
database write without an authorization call in its path fails the build.** The check is structural,
over the module graph, not a search for a string — a rule about evidence enforced by text matching
is this project's most-repeated defect (F-20, and F-30 in the place it cost most).

### REQ-4 — a response that sets an auth cookie is never cacheable, and the server client is per-request

The sharpest finding in the memo, quoted from the installed `@supabase/ssr` type definitions:

> _"Headers that must be set on the HTTP response alongside the cookies. Responses that set auth
> cookies must not be cached by CDNs or reverse proxies, otherwise **one user's session token can be
> served to a different user**."_

`setAll` receives `(cookies, headers)`. **`src/lib/supabase/server.ts` today declares `setAll:
(list) => …`** — the headers argument is not ignored, it is not received. That is currently harmless
because nothing authenticates and no CDN sits in front of anything; it is harmless the way an
unlocked door is harmless in an empty building, and it becomes a cross-**user** leak the first time a
session and a cache exist together. It is fixed here rather than filed: a defect is never a deferral,
and this one is in the module this spec exists to wire up.

The same contract carries two more rules, both easy to violate by writing ordinary-looking code:

- **A new server client per request.** _"The cache headers are delivered only with the first cookie
  write… reusing one across requests would leave later responses without the required cache
  headers."_ A module-level client is the natural refactor and it silently removes the protection.
- **Verify before the response is generated.** _"If a token refresh completes after the HTTP response
  has already been committed, the updated session cannot be written here and will be lost, causing
  the next request to refresh again."_

This requirement contracts SPEC-003, whose cache-key gate already owns the question _"can a response
carrying tenant data be cached?"_ — this is the same question about the session that identifies the
tenant, and it belongs to the same gate rather than a new one beside it.

### REQ-5 — route protection is asserted coverage, not an assumption about a matcher

Two independent statements, because one of them is a convenience and the other is the boundary.

**The convenience:** every authenticated route is covered by the proxy matcher, asserted with
`unstable_doesProxyMatch` rather than read off a regular expression by eye. A matcher is a regex with
negative lookaheads, and reviewing one by inspection is how a route quietly stops being covered.

**The boundary:** every authenticated route authorizes in its own data path (REQ-1), so matcher
coverage is a redirect-to-login nicety and never the thing standing between a stranger and a row.

The reason both exist is the gap Next.js documents about the layer this spec is not allowed to trust:

> _"Server Functions are not separate routes in this chain. They are handled as POST requests to the
> route where they are used, so a Proxy matcher that excludes a path will also skip Server Function
> calls on that path. A matcher change or a refactor that moves a Server Function to a different
> route can silently remove Proxy coverage."_

Coverage that a file move can delete is not a boundary. It is a good default, which is the category
this spec is most careful about.

### REQ-6 — the auth configuration is stated, including the values that are already correct

The F-31 requirement, and the one that is uncomfortable because most of it changes nothing today.

Measured in `supabase/config.toml` on 2026-09-08: `[auth.sessions]` is commented out, so a session
has neither a `timebox` nor an `inactivity_timeout` and never expires. `minimum_password_length` is
`6`, against the file's own comment reading "recommended 8 or more". `password_requirements` is
empty. `enable_confirmations` is `false`, so email ownership is never proven. `[auth.captcha]` is
commented out. And `enable_refresh_token_rotation` is `true` — **correct, and the most important row
in the table**, because it is correct by Supabase's choice rather than keelblock's, exactly as
`anon`'s table privileges were correct by one Postgres image's choice until CI pulled another.

So: every value in the `[auth]` block is decided, set explicitly, and pinned by a test that fails
when it moves — the ones being changed and the ones being kept alike. A test that pins a value it
agrees with is the only kind that would have caught F-31.

**And it must govern production.** There is no `[remotes]` block, so this file configures a laptop;
a deployed project's auth settings live in a dashboard, outside the repository, undiffable and
unreviewed. Supabase supports config-as-code keyed by project id for exactly this. Without it, every
requirement in this section is a statement about local development wearing the clothes of a policy.

### REQ-7 — the callback validates its redirect, and both flows use PKCE

The magic-link and OAuth callback exchanges a code for a session (`exchangeCodeForSession`) and then
sends the user somewhere. Where it sends them is attacker-supplied.

Two independent controls, because each covers the other's blind spot:

- **Supabase's allowlist** governs where the provider may return to. Globstar patterns are supported
  and are a development convenience; production uses exact paths, per Supabase's own recommendation.
- **The application validates its own `next` parameter** as a same-origin relative path. An absolute
  URL, a protocol-relative `//evil.example`, or a scheme-bearing value is refused rather than
  redirected to — this is the classic open redirect, and on an auth callback it is an open redirect
  from a page the user reached by clicking a link in their email.

### REQ-8 — sign-out clears the session server-side, and the UI never decides it worked

Sign-out removes the auth cookies on the response, and the next request is unauthenticated because
the DAL says so, not because a client component set some state. Scope is chosen deliberately — local
versus every session for the user — and written down, because "sign out everywhere" is what a person
believes they clicked after losing a laptop.

### REQ-9 — auth email is configured, and the delivery limit is a stated constraint

Supabase's default auth email rate limit is **2 per hour**, project-wide, and _"You can only change
this with your own custom SMTP setup."_ For a magic-link-first product that is not a hardening item;
it is the third login of the hour failing.

So custom SMTP is part of the production configuration rather than a later nicety, and the limit is
documented where an installer will meet it rather than discovered under load.

The same source names a failure mode that no amount of correct code prevents: enterprise mail
scanners fetch links before the recipient does, **consuming a single-use magic link** and leaving the
user with an expired one. The documented mitigation — a link to a domain you control that redirects
on click — is a design decision this spec must make rather than inherit, and OAuth's presence as a
second method is part of the answer.

## Acceptance criteria

| AC    | Verifies     | Method | Evidence                                                                                                                                                            | Status           |
| ----- | ------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| AC-1  | REQ-1        | test   | a forged `x-middleware-subrequest` header reaches a protected route and is still refused — needs a protected route (SPEC-005)                                       | planned          |
| AC-2  | REQ-1        | test   | `scripts/check-boundaries.test.mts` — authorization is reached per action; the proxy performs none                                                                  | **done**         |
| AC-3  | REQ-2        | test   | `src/lib/auth/config.test.mts` — no source file calls `getSession()`, and the DAL verifies with `getClaims()` (non-vacuous)                                         | **done**         |
| AC-4  | REQ-3        | test   | `scripts/check-boundaries.test.mts` — an unauthorized action fails the gate, and one authorizing action does not launder its neighbours                             | **done**         |
| AC-5  | REQ-4        | test   | `src/lib/supabase/proxy.test.mts` — a refreshed response carries `private, no-store`; `scripts/check-boundaries.test.mts` — a one-parameter `setAll` fails the gate | **done**         |
| AC-6  | REQ-4        | test   | `src/lib/supabase/proxy.test.mts` — two calls construct two clients, so a hoisted one cannot satisfy it                                                             | **done**         |
| AC-7  | REQ-5        | test   | every authenticated route matches the proxy matcher via `unstable_doesProxyMatch` — needs an authenticated route (SPEC-005)                                         | planned          |
| AC-8  | REQ-5        | test   | an authenticated route excluded from the matcher still refuses an unauthenticated caller — needs one to exist (SPEC-005)                                            | planned          |
| AC-9  | REQ-6        | test   | `src/lib/auth/config.test.mts` — sessions, rotation, password length, OTP expiry and the email cap pinned, including values kept as they were                       | **done**         |
| AC-10 | REQ-6        | test   | a `[remotes]` block per deployed project — keelblock has no environments of its own, so there is no project id to key one to                                        | deferred DEF-001 |
| AC-11 | REQ-7        | test   | `src/lib/auth/redirect.test.mts` — absolute, protocol-relative, backslash, control-character and encoded payloads all refused, as one invariant                     | **done**         |
| AC-12 | REQ-7        | test   | `src/lib/auth/config.test.mts` — `additional_redirect_urls` carries no globstar                                                                                     | **done**         |
| AC-13 | REQ-8        | test   | `src/app/[locale]/login/actions.test.mts` — sign-out is server-side, scoped `local`, and redirects; no client state involved                                        | **done**         |
| AC-14 | REQ-9        | test   | SMTP validated at boot — needs a sending domain and provider account. The 2/hour cap is pinned by `config.test.mts` and documented in `.env.example`                | deferred DEF-019 |
| AC-15 | REQ-1, REQ-3 | test   | the journey layer drives a real sign-in in a browser. The flow itself IS verified end to end — see the verification record below                                    | deferred DEF-002 |

## Definition of Done

- [ ] Every REQ `done` with its AC passing, or covered by an open `DEF-*` with a machine-evaluable trigger.
- [ ] Cheap gates green: `npm run check`.
- [ ] The research memo re-verified on the date of build. Both the `proxy` rename and the `getClaims`
      recommendation are recent enough that a memo written today is a liability by spring.
- [ ] **The signing key type is measured, not assumed.** `getClaims()` verifies locally against
      published keys only with an asymmetric key; with the legacy shared secret this project has not
      moved off, every authorized request may involve the Auth server. Measure it, and either move to
      asymmetric keys or record the round trip as a known cost. Shipping "our authorization check is
      local and fast" without having looked is the failure this whole spec is written against.
- [ ] **Validation note:** a second pair of eyes attempted, by hand, to reach a tenant row without
      signing in — a forged subrequest header, a direct POST to a Server Action, a callback with a
      hostile `next`, and a request replayed after sign-out. A green suite is compatible with a login
      screen that decorates an open door.

## Deferrals

- **DEF-017** — MFA and leaked-password protection, both Supabase Pro-plan features.

DEF-002 (journey tests), DEF-004 (the unwired Supabase clients) and DEF-006 (auth hardening) all
carry the trigger `spec-done:SPEC-004` and fire when this spec closes. That is deliberate and worth
reading as a warning rather than a formality: **marking this spec `done` fails the build until three
other pieces of work are picked up.** They were filed that way because each of them is work that only
becomes possible once a login exists, and the moment it does is the moment they stop being reasonable
to postpone.

## Verification record

**A full magic-link round trip through the running application**, against the local Supabase stack,
2026-09-08. Recorded here because it is evidence a unit test cannot give, the browser journey layer
(DEF-002) does not exist yet, and REQ-4's property is only meaningful on a real response.

```
1 · signInWithOtp      ok — 3 PKCE verifier cookies written
2 · link from mailbox   http://127.0.0.1:54721/auth/v1/verify?token=…&type=magiclink
3 · supabase verify     303 → http://127.0.0.1:3111/auth/callback?code=…&next=%2F
4 · our callback        307 → /
    cache-control       private, no-cache, no-store, must-revalidate, max-age=0
    auth cookies set    2
5 · home page shows     Signed in as probe+…@example.com
```

Line 4 is the one worth keeping: the cache headers are on a real redirect carrying two auth cookies.
That is the property REQ-4 exists for, observed rather than asserted.

The failure paths were driven separately — a callback with no code, and one with a bad code, both
redirect to `/login?error=link` and reveal nothing about which failed. The same session settled a
design question by measurement rather than reasoning; see [F-33](../docs/FINDINGS.md).

## Out-of-spec log

- **REQ-8 scope decision.** Sign-out is `scope: 'local'` — this session only. "Sign out everywhere"
  is a different promise and gets its own control rather than being bundled invisibly.
- **`requireUser()` is not built.** The DAL exports `getCurrentUser()` only. The throwing variant has
  no caller until the first authenticated-only surface exists (SPEC-005), and an exported function
  nothing calls is a stub by this project's own rule.
- **The REQ-3 rule is per action, not per module.** The first implementation asked whether the FILE
  reached an authorizer; adding an authorizing `signOut` beside two unauthenticated sign-in actions
  made all three look authorized. Its own non-vacuity assertion caught it within the hour.
- **Supabase config is read through one helper**, not the validated `env` object, in all three
  clients. `env` is `server-only` and `NEXT_PUBLIC_*` are bundler-inlined; importing it from a Route
  Handler also made `next build` require a configured project to collect page data, which turns a
  missing variable into a build failure on a clean clone rather than a named runtime error.
