# What a scaffolded project has to remember about where it came from

_Researched 2026-09-09, for SPEC-011. The measured section is this repository's own behaviour and can
be re-run in two minutes; the field section is other people's documentation and is cited._

## The question, stated so it can be answered

`create-keelblock-app` looks like a file-copying problem. It is not. **Scaffolding and upgrading are
one decision seen twice**: the scaffolder decides what the buyer's project remembers about its
origin, and `scripts/upgrade.mjs` consumes exactly that. So the question is not "how do I download a
tarball", it is:

1. Does the buyer's project keep keelblock's git history, or start its own?
2. What does it record about which release it came from?
3. What does the upgrade path read to find the release it is upgrading **from**?

Get (3) wrong and B-10's CI job stays green while no buyer can upgrade at all — because the job's
scaffold and a real buyer's scaffold are not the same kind of object.

## Measured first, because it settles the design

`scripts/upgrade.mjs` runs, in the buyer's directory:

```
git diff --name-only HEAD <release>
git checkout <release> -- <paths>
```

Both need `<release>` to resolve **as a ref in the buyer's repository**. Three scaffold shapes were
built from this repository at `v0.1.0` and asked to upgrade to `34c6dd1`:

| Scaffold shape                                                | Result                                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `git archive` → `git init` → one commit (a tarball copy)      | **`fatal: bad object 34c6dd1`** — dies on the first command                  |
| the same, plus `git remote add upstream` + `git fetch --tags` | **works** — 52 upstream-owned files taken, migrations applied, 50 left alone |
| `git worktree add <tag>` from this repository                 | works — and this is what CI does                                             |

The third row is the important one. `.github/workflows/check.yml`'s `upgrade` job scaffolds with
`git worktree add /tmp/scaffold "$TAG"`, which carries **every ref in the repository**. That is why
B-10 is green, and it is an honest proof of the _plan_ logic — `planUpgrade`, the ownership boundary,
the positive control. It is **not** a proof of the path a buyer walks, because no buyer will have a
worktree of keelblock's repository. Nothing said so, and until a scaffolder exists there was no other
shape to test against.

A second signal was sitting in the code the whole time: `upgrade.mjs` defaults its release argument
to **`upstream/main`**. The answer was already encoded in a default value, and never written down.

## What the field does

**`create-next-app` initialises a git repository in the generated project.** The documented flag is
`--disable-git` — _"Explicitly tell the CLI to disable git initialization"_ — so a fresh repo is the
default. On preserving template history, or on upgrading a generated project afterwards, the page
says **nothing at all**. That silence is the category norm rather than an oversight: the generated
project is a copy, and the relationship ends at generation.

**`degit` makes the discard explicit** and sells it as the feature: it _"downloads the associated tar
file … (This is much quicker than using `git clone`, because you're not downloading the entire git
history.)"_ Speed is the reason, and it is a real one against a five-minute budget.

**The paid kits in this category answer with a git remote** — MakerKit documents adding `upstream` and
running `git pull upstream main`; Supastarter documents the same and admits in its own docs that it
"will become harder to update your code base" as you diverge. `research/10-UPGRADE-PATH.md` §"The
paid kits in this category" covers both with quotations, and settled keelblock's ownership boundary
in response. What it explicitly did **not** settle is this memo's subject.

So the field splits cleanly: **fast scaffolders discard provenance and have no upgrade story; kits
with an upgrade story keep a git remote and pay for it in merge conflicts.**

## Settled

**The buyer's project starts its own history, and keeps a fetchable pointer home.** Concretely:

- **A file copy, then `git init` and one commit.** Not a clone. The buyer's first commit is their
  project's beginning — the degit reason (speed, against a five-minute bar) and the
  `create-next-app` default, and it avoids handing someone 200 commits of a product they did not
  write.
- **Provenance is recorded in a file, machine-readable**, naming the release and the exact commit.
  A version string alone is not enough for `upgrade.mjs`, which needs an object, but it is what makes
  the project able to _say_ what it is without a network call — and it is what a support question and
  a release note both key on.
- **An `upstream` git remote is configured, and not fetched.** This is the part the measurement
  forces. Objects have to be reachable or upgrade cannot start, but fetching keelblock's history at
  scaffold time spends the five-minute budget on something the buyer may never use. Adding the remote
  costs milliseconds; `git fetch upstream --tags` at upgrade time costs seconds, once, when it is
  actually needed.
- **Therefore the documented upgrade is two commands, not one**, and the scaffolder prints them.

This preserves memo 10's boundary exactly — nothing here changes which files upstream owns. It
supplies the thing that boundary assumed and never had: a project shaped so the boundary can be
applied to it.

## Contested, and deliberately not settled here

- **Whether `keelblock upgrade` should become its own CLI verb** rather than
  `node scripts/upgrade.mjs <ref>`. It is a nicer surface and it is not required by anything; the
  script is already upstream-owned and already copied into the buyer's project.
- **Whether the scaffolder should offer to remove optional modules at generation time.** F-56
  measured what removal costs and found the gates produce the checklist; wiring that into a prompt is
  SPEC-014's question, not this one.
- **Monorepo and package-manager variants.** `create-next-app` carries `--use-pnpm`/`--use-yarn`/
  `--use-bun`; keelblock has one lockfile and one supported manager until somebody asks.

## Sources

- Next.js, `create-next-app` CLI reference — the `--disable-git` flag, and the absence of any upgrade
  guidance. https://nextjs.org/docs/app/api-reference/cli/create-next-app (read 2026-09-09)
- `degit` README — tarball download, history deliberately not fetched.
  https://github.com/Rich-Harris/degit (read 2026-09-09)
- MakerKit and Supastarter upgrade documentation — quoted in `research/10-UPGRADE-PATH.md`, which
  read them on 2026-09-07.
- This repository: `scripts/upgrade.mjs`, `.github/workflows/check.yml` (`upgrade` job), and the
  three-shape experiment above, run 2026-09-09.
