# The first row that must cross the tenant boundary

_Researched 2026-09-08, before SPEC-006 was written. Every policy in this schema denies a
non-member, by design and on purpose. **An invitation cannot.** It exists to be read by somebody who
is not a member yet, and how it does that decides whether the isolation claim survives its first
deliberate exception._

## The question, stated precisely

`is_org_member(organization_id)` is the predicate on every tenant table. An invitation row is
addressed to somebody for whom that predicate is false — that is the entire point of the row. So one
of three things has to give, and they are not equivalent.

## Option A — a policy that admits `anon`

`create policy … to anon using (true)` on the invitation table, and the application filters by token.

Refused, and the primary source is blunt about why: _"A policy that reads `to anon using (true)`
grants every unauthenticated visitor read access to every row the role can already reach through
grants."_ The filter would live in application code, which is the pattern this project exists to
refuse — F-15 in a new place, with the row in memory before anything decides you were entitled to it.

A policy cannot be parameterised by a request value either. There is no `current_setting` a browser
client can set (memo 08, Option B), so "admit anon and match the token in the policy" is not
expressible.

## Option B — a row readable by email match

`to authenticated using (email = auth.jwt() ->> 'email')`.

Better than A, and genuinely tempting: the email claim is issued by Supabase rather than supplied by
the user, and the RLS guidance draws exactly that line — _"`raw_user_meta_data` can be updated by the
authenticated user… `raw_app_meta_data` cannot be updated by the user, so it's a good place to store
authorization data."_ The top-level `email` claim is in the second category.

Two problems, and the second is decisive.

**The invitee usually has no account yet.** They cannot be `authenticated` before they exist, so the
invitation is invisible until after sign-up — which means the accept page cannot say _who invited
you_ before asking you to sign in. That is a real product cost, not a cosmetic one: a stranger is
asked to create an account to discover what they were offered.

**It leaks the guest list.** A policy keyed on email means anyone who signs up as `x@company.com`
sees every invitation ever sent to that address, including from organizations that later revoked
them. Worse, it makes the invitation table a probe: an attacker who controls any address learns
which organizations invited it. The row is not sensitive to the invitee; it is sensitive to the
INVITER, and an email-keyed policy protects the wrong party.

## Option C — no policy admits a stranger; one narrow function does

**Chosen.** No policy on the invitation table admits anybody who is not already an admin of the
organization. Reading an invitation as a stranger happens through a `SECURITY DEFINER` function that
takes the token and returns only what the invitee needs to decide.

The mechanism is the one SPEC-001 already relies on and constrains: _"a 'security definer' function
runs using the same role that created the function… that function will have `bypassrls`
privileges."_ SPEC-001 REQ-11 is the discipline that makes it safe — such a function returns a
scalar, takes only the values it needs, and has EXECUTE revoked from `public`. This is the first one
that must return more than a boolean, so the return shape is the security boundary and is written
down rather than inferred: **the organization's name and the invited role. Not the organization's
id, not the inviter, not the invitee's email, not whether other invitations exist.** A stranger with
a valid token learns "Acme invited you as an admin" and nothing that helps them do anything else.

### The token

- **Random, and stored hashed.** The row holds `sha256(token)`; the plaintext exists only in the
  emailed link. `pgcrypto` is present on the stack (verified), so `digest(…, 'sha256')` is available
  in SQL. This is the property that matters if the database is ever read by someone who should not
  have read it: a leaked table of invitations is not a set of working invitations.
- **Single-use, enforced in one statement.** Acceptance sets `accepted_at` in the same `update … where
accepted_at is null` that grants the membership, so two simultaneous accepts cannot both win. A
  check-then-act across two statements is the classic version of this bug.
- **Expiring.** A token that never expires is a credential with no revocation story. Seven days is
  the value chosen, and it is a number rather than a principle — it belongs in the spec so it can be
  argued with.
- **Replayed after acceptance, revocation or expiry: the same answer.** Not "already accepted",
  which tells a stranger their guess was once valid. Not found.

## What this changes about the access matrix

`organization_invitation` will show `Authenticated · different organization` as **no access**, like
every other tenant table — because the exception is not in a policy. The function is the exception,
and it is a reviewable artifact with a stated return shape. That is the honest way to take the
exception: **narrow it to one door and describe the door**, rather than widening a policy and
explaining the width.

## The revocation walk, which is why this spec matters

Memo 08 established that keelblock reads membership per request rather than caching it in a token,
so a revoked admin loses access immediately rather than at token expiry. **That has been an argument
until now** — there was no revocation to perform. SPEC-006 makes it a journey test: an admin is
removed while signed in, and their next request is refused, with no token refresh and no sign-out.

Worth stating what that does NOT prove. Their access token remains valid until it expires; what
changes is that nothing in this system consults it for authorization. A design that put the role in
a claim would still be serving that person as an admin, and the difference is observable rather than
architectural — which is exactly why it should be walked rather than asserted.

## Settled / contested

**Settled:** no policy admits a stranger · the exception is one `SECURITY DEFINER` function with a
stated return shape · tokens are hashed at rest and single-use · a replayed token is indistinguishable
from an invented one · the email claim is Supabase-issued and not user-editable (relevant, but not
relied upon).

**Contested, and labelled where it appears:** the seven-day lifetime is a judgment with no evidence
behind it. **Unmeasured:** whether an unauthenticated preview endpoint needs rate limiting beyond
token entropy — 256 bits is not guessable, but an endpoint that answers is still an endpoint, and
this project has no rate limiting anywhere (DEF-006).

## Sources

**Primary** — the vendor's own documentation and this repository's own migrations:

- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) · `to anon using (true)` and what it grants; `raw_user_meta_data` is user-editable and `raw_app_meta_data` is not; a `SECURITY DEFINER` function runs as its creator and carries `bypassrls`
- [Supabase — Custom claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac) · the `auth.jwt()` accessor used by Option B
- `supabase/migrations/20260907120000_tenancy_foundation.sql` · SPEC-001 REQ-11's rule that a definer function reachable by `authenticated` returns a scalar and is revoked from `public` and `anon` — the discipline Option C has to extend rather than break
- `supabase/migrations/20260907150000_membership_invariants.sql` · owner authority and last-owner succession, which acceptance and revocation must not be able to violate
- `research/08-ORG-CONTEXT.md` · the per-request membership read that makes immediate revocation possible at all
- Verified on the stack: `pgcrypto` is installed and `digest(…, 'sha256')` evaluates

**Secondary** — used to orient, not relied upon for any claim:

- The password-reset token pattern as commonly described — random, hashed at rest, single-use, expiring. Nothing here rests on a particular write-up of it; the properties are argued above on their own terms.

## The version note this memo will go stale on

The reasoning depends on two things that could move: that a policy cannot be parameterised by a
request value reachable from a browser client, and that `SECURITY DEFINER` remains the sanctioned
narrow-door mechanism. If Supabase ships a supported per-request setting, Option A becomes
expressible and this page should be re-read rather than cited.
