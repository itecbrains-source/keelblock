# Documentation that runs, and the part of a walkthrough no machine can run

_Researched 2026-09-09, for SPEC-012. The competitor claim is one workflow file, read on that date;
the ecosystem sources are two vendor pages; the boundary at the end is a decision, not a finding._

## The question

Bar B-5's stated proof is "a scripted walkthrough run by someone with no prior context, timed and
recorded". That is a **promise about a future event** — exactly the shape B-1 was in until this week,
when it stopped being a number in a document and became a job with a budget.

The same move is available here, and it is not the whole bar. So the question this memo has to settle
is not "can documentation be executed" — obviously it can — but **where the line falls between the
part a machine can run and the part that requires a person to be confused by it.** Get that wrong in
one direction and the gate proves nothing; get it wrong in the other and B-11's handover trial is
quietly absorbed into a green tick.

## What this category does: nothing

`boxyhq/saas-starter-kit` is the most-starred free kit in the field and keelblock's closest
competitor. It has **one** CI workflow. Its steps, read on 2026-09-09:

```
npm install · check-lint · check-format · check-locale · test · build-ci · check-types
prisma migrate deploy · playwright deps · e2e tests · upload artifact
```

Every one runs an npm script. **No step extracts or executes their installation documentation.**
That claim is exactly as broad as the file: one workflow, one repository, read once. It says nothing
about the paid kits, whose CI is not public.

This is the ordinary state. Install documentation rots because nothing runs it, and it rots in the
one place where a reader has no prior context to recover from it.

## What ecosystems that solved it do

**Rust runs the examples in its documentation as tests.** `rustdoc`'s own words: _"rustdoc supports
executing your documentation examples as tests. This makes sure that examples within your
documentation are up to date and working."_ Two mechanisms matter more than the headline:

- **Setup a reader should not see.** Lines prefixed `#` are _"hidden from the output, but will be
  used when compiling your code"_. The document a person reads and the program a machine runs are
  allowed to differ, deliberately and in-band.
- **Explicit escape hatches**: `ignore`, `no_run`, `should_panic`, `compile_fail`. A block that
  cannot or must not be executed says so where it sits, rather than being silently skipped.

**Go asserts on output, not on exit status.** Its testing framework _"captures data written to
standard output and then compares the output against the example's `Output:` comment. The test passes
if the test's output matches its output comment."_ And, tellingly, _"If we remove the output comment
entirely then the example function is compiled but not executed"_ — a compile-only mode for examples
that reach the network.

Go's mechanism is the right instinct in the wrong currency for a shell walkthrough: matching stdout
would pin version banners, port numbers and timings, and would be edited into uselessness within a
month. What survives translation is the **principle**, which this repository already holds under a
different name: exit zero is not evidence, something must be PRESENT.

## Settled

**The machine's half — a gate, and it is the whole command sequence.** The setup page is the source.
A runner extracts its shell blocks in order, executes them on a clean runner, and then asserts a
property the commands cannot fake: a project that exists, checks green, and reports itself generated.
Timed, because B-5 and B-1 are both promises about how long a stranger waits.

**The human's half — not this spec's, and not to be absorbed.** Whether the page is comprehensible,
whether a newcomer knows which command is next, whether the words mean what their author thought:
none of that survives contact with a machine, which will happily execute a perfectly incomprehensible
page. That is B-11, it is measured by the handover trial, and its human leg is DEF-024. **A green
walkthrough job is evidence the instructions WORK, and no evidence at all that they TEACH.** SPEC-012
says so in its own text rather than leaving a reader to infer it from a badge.

**Blocks that cannot run say so in the page**, adopting Rust's design rather than inventing one: an
info-string marker, visible in the source, next to the block it governs. Absent marker means the
block runs — the default is execution, so forgetting is loud rather than silent.

**Substitutions are declared, reasoned, and shrink-only.** One is needed today and only one:
`npx create-keelblock-app` resolves to a placeholder package until DEF-027 is closed, so CI runs the
local scaffolder in its place. That is Rust's hidden-setup-line idea with the honesty inverted —
visible in the runner rather than hidden in the page, carrying its reason, and countable, so a
walkthrough quietly diverging from the page is a failure rather than a habit.

## Contested, and not settled here

- **Whether the walkthrough should run in `npm run check`.** It installs, starts a database and
  builds; it belongs with `scaffold` in CI, on the same reasoning that keeps the journey layer out
  of the local loop. If the local loop ever gets a fast mode, revisit.
- **Whether the task guides get the same treatment.** They do not depend on the scaffolder and one
  already exists (F-47). Their commands are shorter and their failure mode is different — a wrong
  recipe is caught by the gates it teaches you to run.
- **Windows and non-Docker hosts.** The page assumes a POSIX shell and Docker, as the repository
  does. Untested elsewhere and claimed nowhere.

## Sources

**Primary** — each project's own documentation and its own repository, read 2026-09-09:

- [rustdoc — Documentation tests](https://doc.rust-lang.org/rustdoc/write-documentation/documentation-tests.html) · the purpose sentence, `#`-hidden setup lines, and the `ignore` / `no_run` / `should_panic` / `compile_fail` attributes
- [The Go Blog — Testable Examples in Go](https://go.dev/blog/examples) · output comparison, and the compile-only mode for examples that reach the network
- [`boxyhq/saas-starter-kit` — `.github/workflows/main.yml`](https://github.com/boxyhq/saas-starter-kit/blob/main/.github/workflows/main.yml) · the complete step list quoted above; **one** workflow, and no step that runs their installation documentation

**Measured here**, not read anywhere:

- The `scaffold` job added for SPEC-011, which is the template for this runner and for its timing.

**Secondary** — none. Nothing in this memo rests on a summary of somebody else's reading; the three
pages above were opened, and the competitor claim is deliberately scoped to the single file that was.
