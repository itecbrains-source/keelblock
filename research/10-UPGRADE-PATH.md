# What "upgrade" means when the product is a copy

_Researched 2026-09-08. The question is not how to write a codemod. It is what an upgrade can even be
when the buyer forked at a tag and has since changed the files you want to change._

## The question, stated so it can be answered

A buyer clones at `v1`. They rename things, delete what they do not need, and write their own
features. In September upstream fixes an isolation bug. Something has to carry that fix into a
repository upstream has never seen and does not control.

Every answer in the field is a position on one boundary: **which files does upstream own, and which
does the buyer own?** Everything else — codemods, merges, CLIs — is mechanism for delivering across
it. Four ecosystems answer it four different ways, and the two paid kits in this category answer it
by not answering.

## What the field actually does

### Rails — no ownership model at all; ask the human, file by file

`bin/rails app:update` "assists … the creation of new files and changes of old files in an
**interactive session**", prompting per file:

```
Overwrite /myapp/config/application.rb? (enter "h" for help) [Ynaqdh]
```

The most mature upgrade story in any web framework **does not classify files as framework-owned or
application-owned.** It presents a diff and delegates the decision, and lets you plug in your own
tools through `THOR_DIFF` and `THOR_MERGE`. Its guidance is "don't forget to review the difference".

What Rails _does_ structurally is more interesting than its merge: new behaviour arrives as a **new
file per version**, `config/initializers/new_framework_defaults_X_Y.rb`, carrying flags the app opts
into. The upgrade adds a file rather than editing one — and a new file has nobody to conflict with.

### Expo — make the contested surface disposable

Continuous Native Generation deletes the argument instead of resolving it. `npx expo prebuild`
generates `android/` and `ios/` from config, and Expo is explicit about what that means for editing
them:

> "If you modify the generated directories manually then you risk losing your changes the next time
> you run `npx expo prebuild --clean`. Instead, use config plugins."

The customisation surface is a **programmatic seam**, not the output. `--clean` refuses quietly to be
polite about it: it warns when the working tree is dirty, because it is about to delete and recreate
everything.

### Next.js — mechanical transforms, and a failure that stops the build

`npx @next/codemod <transform> <path>` applies breaking-API changes programmatically. The part worth
stealing is what happens when it _cannot_ finish:

> "When this codemod identifies a spot that might require manual intervention, but we aren't able to
> determine the exact fix, it will add a comment or typecast … **Your build will error until these
> comments are explicitly removed.**"

A codemod that cannot complete does not guess and does not silently half-apply. It leaves the project
in a state that fails loudly. That is the same instinct as ADR-008's "reports anything needing hands
rather than pretending it merged", already stated here as an intention and not yet as a mechanism.

### The paid kits in this category — a git remote

**MakerKit** documents adding `upstream` and running `git pull upstream main`, with the advice to
"run this regularly". Read the page for what it does not contain: **merge conflicts are not
mentioned.** The only failure mode it warns about is forgetting `pnpm i` afterwards.

**Supastarter** is the honest one, and its own documentation is the best evidence in this memo that
the problem is real:

> "Updating your code to the latest updates and features of supastarter is in general possible, but
> **with every change you make to your application, it will become harder to update your code base**,
> because you are essentially rebasing your code on top of the latest supastarter code with Git … If
> you have any merge conflicts, you will have to resolve them manually."

That is a vendor writing down, in its own documentation, that its upgrade path degrades in proportion
to how much the customer used the product. It is not a criticism of Supastarter — it is the category's
structural problem, admitted.

## Settled: the ownership boundary for keelblock

ADR-008 already chose the strategy (Option C: structure so security fixes land where conflicts are
impossible). This memo settles the boundary it depends on, in the light of the above and of the
experiment run alongside it.

**Upstream-owned — replaceable wholesale, and the buyer is expected not to edit them:**
`supabase/migrations/**` (append-only by construction), `scripts/**` (the gates), `spec/**`,
`docs/adr/**`, `supabase/tests/intent/**`.

**Buyer-owned — never touched by an upgrade, at any version:** `src/**`, `messages/**`,
`e2e/**` beyond the fixtures, and every configuration file carrying a project's identity.

**Generated — owned by neither, and this is the case the field's answers all miss:**
`src/lib/db/database.types.ts` and `docs/ACCESS-MATRIX.md` are functions of _the buyer's_ schema, not
upstream's. Measured: after the upgrade, upstream's committed types contain `organization_invitation`
and not the buyer's `customer_note`; the buyer's contain neither. **Neither file is correct, so
neither can be delivered** — a generated artifact must be regenerated on the buyer's side, and an
upgrade path that ships one silently overwrites the buyer's schema knowledge with upstream's.

**A change spanning both** is delivered as: the migration (upstream, applied), plus a codemod for the
mechanical part of the product change, plus — Next's rule — a loud failure where the codemod cannot
finish. Never a silent partial edit.

## What this memo does not settle

- **Codemod authoring.** No breaking product-API change has happened yet, so a codemod written now
  would be written against an imagined change. Deferred deliberately rather than invented.
- **Advisories.** GitHub Security Advisories are a publishing act, not a code path; they need a
  release process that does not exist yet.

## Sources

**Primary** — each project's own documentation, read 2026-09-08:

- [Rails — Upgrading Ruby on Rails](https://guides.rubyonrails.org/upgrading_ruby_on_rails.html) · `app:update`, the interactive prompt, `new_framework_defaults_X_Y.rb`
- [Expo — Prebuild](https://docs.expo.dev/workflow/prebuild/) · Continuous Native Generation, config plugins, `--clean`
- [Next.js — Codemods](https://nextjs.org/docs/app/guides/upgrading/codemods) · transforms, and the build-erroring markers when a transform cannot finish
- [MakerKit — Clone the repository](https://makerkit.dev/docs/next-supabase-turbo/installation/clone-repository) · `git pull upstream main`; conflicts not mentioned
- [supastarter — Update the codebase](https://supastarter.dev/docs/nextjs/codebase/update) · the rebase model and the admission that it degrades with use

**Secondary** — used only to locate the primaries above, never to establish a fact:

- Search results describing the MakerKit CLI's update behaviour. The CLI's own claims were **not**
  used: the documented `git pull upstream main` was read from MakerKit's own page instead.
