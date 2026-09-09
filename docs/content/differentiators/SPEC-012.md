Ask a vendor when their setup page was last known to work. Not reviewed — **run**.

Install documentation rots for a structural reason: it is the page nobody on the team ever reads
again. They already have the project. So the commands drift, a flag changes, a step becomes
unnecessary, and the person who finds out is a stranger on their first ten minutes, with no context
to recover from it.

Measured on the closest comparable kit, and scoped to exactly what was opened:
[`boxyhq/saas-starter-kit`](https://github.com/boxyhq/saas-starter-kit) has **one** CI workflow. Read
on 2026-09-09, its steps are `npm install`, lint, format, locale, test, build, types, a Prisma
migration and Playwright e2e. Every one runs an npm script. **No step executes their installation
documentation.** That is the ordinary state of the field, not a criticism of one repository.

Here, `docs/GETTING-STARTED.md` is the source. On every push a runner extracts its shell blocks, in
order, and executes them in one shell in an empty directory — because a person follows a page in one
terminal, and `cd my-app` is load-bearing for everything after it. The idea is borrowed rather than
invented: rustdoc runs the examples in Rust's documentation so that "examples within your
documentation are up to date and working", and it lets a block say in-band when it cannot be run.

And the job asserts an **artefact**, not an exit status: a project that exists, declares itself
generated, and passed its own proof suite. Go's testable examples make the same point by comparing
output; output is the wrong currency for a shell, where it would pin version banners and port
numbers, so what gets asserted is the thing the commands were supposed to produce.

**What this does not claim, and the claim is better for it.** A machine will happily execute a
perfectly incomprehensible page. Whether a newcomer can follow it is a different measurement, taken
by a handover trial with a real participant, and the human half of that is still open. So B-5 —
"a stranger gets there on the documentation alone" — is **not claimed here**. What is claimed is
narrower and checkable: the instructions work, and they worked on the commit you are reading.
