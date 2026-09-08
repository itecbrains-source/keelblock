# ADR-019: Documentation ships with its spec, and the rule is enforced where it can fail

**Status:** Accepted · **Date:** 2026-09-08 · **Deciders:** owner

## Context

`WEBSITE-AND-DOCS.md` already decided the timing correctly — _"With each spec: its documentation ships
as a DoD item. A spec whose docs are missing is not done, because B-5 says a stranger must get there
on the docs alone."_ — and the site waits for v0.1.

The rule has never been enforced. It lives in one prose file and is absent from
`spec/_TEMPLATE.spec.md`'s Definition of Done. What is in that DoD is a **gated** requirement for
competitive copy:

> "**Written up.** A `differentiators` entry in `docs/content/MANIFEST.json` … The `content` gate
> refuses a `done` or `partial` spec that has neither."

So a spec cannot ship without a battlecard section and can ship without a word of documentation. One
rule got a gate; the other got a paragraph.

**Two corrections to the framing this ADR was handed, both measured.** The claim that no spec has
shipped a task guide is not quite right — `CONTRIBUTING.md` carries the flagship "Adding a
tenant-scoped table" recipe. But that recipe was **wrong**, in the way that matters most: it said
`enable row level security` and not `force`, which is the exact defect `organization_invitation`
shipped with the same day, and separately it produced a table with no grant, which nobody can read
(F-47).

That is the real argument here, and it is stronger than "documentation is good": **a gate catching a
defect is not the same as the defect being unlearned.** The schema guard learned about missing `FORCE`
on 2026-09-08 from a real table. The guide that teaches people to write those tables was not read on
the same day and would have kept teaching it to everyone who followed it. Documentation is where a
defect gets unlearned, and nothing connected the two.

## Decision Drivers

- B-5: a stranger gets there on the docs alone. Untested prose is how that bar rots.
- The repository's own standard: a rule that only a person enforces is a rule that decays. Every other
  claim here has a check that can fail.
- Not every spec needs a page. A rule that demands one for `SPEC-003` (gates) produces filler, and
  filler is worse than absence because it looks like coverage.

## Considered Options

**A · Leave it in prose and rely on review.** Status quo. Six specs are `done`, the flagship guide was
wrong for the whole of that time, and nobody noticed.

**B · Require a documentation entry per spec, gated, with a reasoned escape.** Mirrors the shape that
already works for differentiators: a `documentation` entry naming where the spec's docs live, or a
`$noDocumentation` entry saying why the spec ships nothing a reader needs.

**C · Write the guides now and add no rule.** Fixes today and not next month.

## Decision

**Chosen: Option B, plus the fix from C** — the recipe defect is repaired in the same change, because
a defect is never deferred to the rule that would have caught it.

The `content` gate gains a documentation rule alongside its differentiator rule. A `done` or `partial`
spec must name where its documentation lives — an existing file is fine, and most already have one —
or record why it needs none. The escape carries a reason and is read by a person, exactly like
`$noDifferentiator`.

**Deliberately NOT decided here:**

- **Making getting-started executable in CI.** It is a good idea and it is B-5's, owned by SPEC-011:
  a job that extracts the commands from the setup page and runs them on a clean runner is the version
  of install docs that cannot rot. It is recorded in the consequences below rather than decided,
  because deciding another spec's scope from an ADR is how a spec stops owning its own bar.
- **Building the site.** Already decided, correctly, and unchanged.

## Consequences

**Positive:** the rule that already existed now fails a build instead of a review. Most specs satisfy
it immediately — `docs/TESTING.md` for SPEC-002 and SPEC-013, `docs/AUTHORIZATION.md` for SPEC-005,
`CONTRIBUTING.md` for SPEC-001 — which is the point: the gate is not asking for new writing, it is
asking for the connection between a spec and the page a stranger reads to use it, so that when one
moves the other is visibly stale.

**Negative — named:** an escape hatch with a reason is an escape hatch, and `$noDocumentation` can be
filled with a sentence. It is the same weakness `$noDifferentiator` has, accepted for the same reason:
a rule with no exit gets satisfied with filler, which is worse.

**The dependency worth stating:** a SETUP page cannot honestly be written before `create-keelblock-app`
exists (SPEC-011) — supastarter's opens with `npx supastarter new`, ours would be a clone at a tag —
and B-1's five-minute claim cannot be documented before the thing being timed exists. Task guides have
no such dependency, which is why they are the part that ships now.
