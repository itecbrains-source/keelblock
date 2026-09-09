# ADR-021: No password sign-in — and the platform still has one

**Status:** Accepted · **Date:** 2026-09-09 · **Deciders:** architect

## Context

Three statements about passwords were all true at once, and they cannot all be right.

- `docs/PRODUCT.md` lists area 2 as "Auth (password, magic link, OAuth, passkeys, 2FA)" and says
  auth covers "email verification, **password reset**, resend, account unlock". Password is in
  scope, twice.
- The shipped login page says **"We email you a link. There is no password to forget or leak."**
  That is not a description, it is an argument — and it is the first sentence a user reads.
- **No ADR mentioned password at all**, and no document anywhere used the word "passwordless".
  Verified by search on 2026-09-09, not assumed.

So a UI string had already decided a product question by implication, which is the same class as the
six undecided things this project made a point of settling. This one is more exposed than any of
them, because a buyer reading that subtitle is being told it is a choice.

**Then the measurement made it worse, and changed what this ADR has to say.** Against the local
stack on 2026-09-09, through the public anon key:

```
POST /auth/v1/signup            {email, password}   → 200, session issued
POST /auth/v1/token?grant_type=password             → 200, session issued
select encrypted_password is not null from auth.users → t
```

Password sign-up and the password grant both work **today**. There is a password to leak; the login
page simply does not offer the box. So the subtitle was not merely undecided, it was **false** — a
security claim the configuration does not back. Supabase's CLI config exposes no key that disables
password auth while keeping magic link, and Supabase's own guidance treats the choice as a
client-side one, so this is a platform property rather than a misconfiguration.

## Decision

**keelblock is passwordless as a product: magic link and OAuth, and no password surface.** No
password field, no password reset, no account-unlock flow, no "change password" screen.

**And the copy stops claiming a property the platform does not provide.** The subtitle now says what
is true of the product — that this application signs you in with a link — and makes no assertion
about what does not exist underneath it.

Rejected, with reasons rather than taste:

| Option                                  | Why not                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ship password sign-in**               | It is a fifth surface to prove in a project whose thesis is that it proves what it ships, and it arrives with reset, lockout and leaked-credential handling attached. Decisively: **leaked-password protection is a Supabase Pro feature (DEF-017)**, so a default keelblock install would ship passwords it cannot check against a breach corpus. That is a worse honesty problem than the one this ADR fixes. |
| **Keep the claim, disable password**    | There is no switch. Verified above.                                                                                                                                                                                                                                                                                                                                                                             |
| **Leave the subtitle and decide later** | The subtitle is the decision, made by whoever wrote the sentence. That is the failure mode this repository names and refuses.                                                                                                                                                                                                                                                                                   |

## Consequences

**Positive:** one user-facing sign-in method, and it is the one with an end-to-end proof through the
real application (SPEC-004 REQ-7). No password reset flow, no lockout policy, no breach-corpus
dependency, and `minimum_password_length` becomes a value nobody's account depends on.

**Negative, and it is the whole cost: email deliverability becomes the single point of failure for
all sign-in.** If mail stops, nobody signs in — there is no second route. That is not a theoretical
risk here: **DEF-019** is already open on the SMTP sender, and Supabase caps auth email at two per
hour project-wide without one, so the third sign-in of an hour fails on a default install. SPEC-004
records the sibling failure — enterprise mail scanners fetch links before the recipient does,
consuming a single-use link. A passwordless product owes that dependency a real answer, and stating
it here is cheaper than discovering it during an outage.

**The honest residue.** The product is passwordless; **the platform is not**. Anyone with the
publishable key can create an account with a password and authenticate with it, and this repository
cannot switch that off. What it can do is refuse to claim otherwise, and keep its own code free of
the surface: `findPasswordSignIn` in `scripts/check-boundaries.mjs` fails the build if any module calls
`signInWithPassword`, parsed rather than searched so the documents explaining the rule do not trip
it. So this decision cannot erode by someone adding a form. Mitigating the
platform side would mean rejecting password sign-ups in a `before_user_created` hook — possible, not
built, and not worth an unexercised hook to solve a problem the copy no longer misstates.
