# ADR-016: One account model — a personal account is an organization of one

**Status:** Accepted · **Date:** 2026-09-08 · **Deciders:** owner

## Context

Every keelblock user belongs to an organization before they can do anything. Nothing in this repository
had ever written down whether that was a decision or an accident — "personal account" appeared in no
spec, ADR or memo until this one.

The field is split, and both halves are deliberate. [Basejump](https://github.com/usebasejump/basejump)
models personal and team accounts as **one table with a `personal_account` boolean**, so a user's own
space and a shared one are the same kind of thing with a flag. MakerKit ships **both kinds** as
separate surfaces. Either way, the pattern users expect is the same: **sign up alone, invite people
later.**

This is not the single-tenant B2C non-goal `PRODUCT.md` refuses. That refusal is about a _market_ —
ShipFast's — where there is no second user and no tenancy at all. Signing up alone and adding
colleagues next month is ordinary B2B onboarding, and refusing it would be refusing the first ten
minutes of every customer's life.

## Decision Drivers

- ADR-001's argument is that **every policy has the same readable shape**. Anything that makes a
  policy branch is spending the one thing that makes this schema checkable.
- The onboarding experience users want must exist. Whether it needs a second concept is the question.
- Whatever is chosen lands in the schema, and the schema is the expensive place to be wrong.

## Considered Options

**A · One model. A personal account IS an organization with a single member.** What already happens:
`create_organization` makes the caller its owner in the same transaction, and SPEC-006 lets them
invite people whenever they like.

**B · Two account kinds, one table, discriminated by a flag** — Basejump's shape.

**C · Two separate surfaces** — a personal space and organizations, as distinct models.

## Decision

**Chosen: Option A.** There is one tenant concept in this schema, and a person working alone owns an
organization with one member. No `personal_account` column, no second surface.

The user-facing pattern is already delivered: you sign up, you get an organization you own, you can
invite people later or never. What Option B would add is not a capability — it is a **flag that every
policy would have to consider**. `is_org_member` and `is_org_admin` are consulted by every policy in
the schema; a personal/team distinction is a branch inside the predicate that decides who sees what,
and F-40 is a fresh reminder of what a subtle wrong answer inside those helpers costs — that one was
`NULL` instead of `false`, invisible in every policy and fatal in the first `if`.

Option C is worse for the same reason twice: two models means two sets of policies and two sets of
proofs, and the access matrix would have to say which one each row belongs to.

**What is genuinely given up, and it is real:** an organization needs a name at sign-up, where Basejump
can create a personal account with none. That is a form field, not an architecture — and SPEC-022
(onboarding) may well decide to default it and let the user rename it later. A form field is the
right size of problem to leave to a UI spec.

## Consequences

**Positive:** one tenancy model, so one policy shape, one set of intent tests and one access matrix.
Everything SPEC-001 proves keeps applying without a case split. Adding a second person later is an
invitation (SPEC-006), not a migration between account kinds.

**Negative — named:** an organization-of-one carries a name and a slug it did not ask for, and the
slug is unique across the whole table, so two people called "Personal" collide. SPEC-022 owns making
that painless. And if keelblock ever wants a user-owned space that is genuinely _not_ shareable — a
private scratch area that cannot be invited into — this ADR is what would have to be reopened, because
under Option A there is no such thing: every organization can be invited into by its owner.
