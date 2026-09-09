# Field scan — what already exists, and where the gap actually is

_Researched 2026-09-07. Every claim below is sourced; re-verify before acting on it, because this
field moves and a stale competitive read is worse than none._

## The market is paid

| Kit                       | Price                    | Stack                                                        | Multi-tenant               | Tests                        | Open                |
| ------------------------- | ------------------------ | ------------------------------------------------------------ | -------------------------- | ---------------------------- | ------------------- |
| **MakerKit**              | $349–649 (free OSS lite) | Next 16, React 19, Supabase, **Drizzle**, **Better Auth**    | yes, hybrid personal/team  | some                         | no                  |
| **Supastarter**           | €349–€1,499              | Next / Nuxt / SvelteKit                                      | yes, "deep"                | **Playwright e2e**           | no                  |
| **ShipFast**              | $199–299                 | Next, minimal                                                | no — single-tenant B2C     | no                           | no                  |
| **Achromatic**            | paid                     | Next                                                         | yes                        | —                            | no                  |
| **`nextjs/saas-starter`** | free                     | Next 16, Postgres, **Drizzle**, shadcn/ui                    | owner/member roles         | no                           | yes                 |
| **BoxyHQ**                | free                     | Next 15.5, **Pages Router**, Prisma, NextAuth + SAML Jackson | teams, **app-layer only**  | 1 unit file + Playwright e2e | **yes, Apache-2.0** |
| **nextacular**            | free                     | Next **13.5**, Pages Router, Prisma, NextAuth 4              | workspaces, app-layer only | **zero**                     | yes                 |

**Correction to this memo (2026-09-07):** the original scan missed
[BoxyHQ](https://github.com/boxyhq/saas-starter-kit) — 4,928 stars, 1,228 forks, 30 contributors,
Apache-2.0. It is the most-starred free option in the category and by far keelblock's closest competitor,
and omitting it made the "no free option exists" claim look easier than it is. Recorded here rather
than quietly fixed.

**It does not weaken the thesis — it is the strongest evidence for it.** BoxyHQ ships SAML SSO,
SCIM directory sync, audit logs, webhooks and API keys, and enforces tenant isolation with
hand-written application guards:

```ts
export const throwIfNoAccessToApiKey = async (apiKeyId: string, teamId: string) => {
  const apiKey = await getApiKeyById(apiKeyId);
  if (teamId !== apiKey.teamId) throw new ApiError(403, '…');
};
```

A grep for `create policy` / `row level security` across its schema and lib returns **zero matches**.
So the most successful free enterprise SaaS starter in the category — five thousand stars, a
thousand forks — has **no database-enforced tenant isolation at all**, and one unit test file, with
its entire safety net in Playwright.

Its business model also explains its shape: the kit is a funnel for the SSO service behind it. That
service is now **Ory Polis**, not BoxyHQ's own product — see the correction below. Free and
enterprise-featured is a distribution strategy, not charity — worth knowing before reading its
feature list as a bar to match.

**Correction to this memo (2026-09-09) — Jackson is now Ory Polis.** BoxyHQ Jackson was acquired
by Ory and is `github.com/ory/polis`; `boxyhq/jackson` redirects there. Still Apache-2.0, still
maintained (100+ commits since its 2026-03-20 release, though most are dependency automation), still
both a standalone service and an embedded library, and it does SCIM 2.0 as well as SAML.

Two things the rename does not change, and one it sharpens:

- **The table above still reads correctly.** The kit's dependency is literally
  `@boxyhq/saml-jackson@26.2.0` — checked in its own `package.json` on 2026-09-09 — so the package
  name has not followed the project name. A find-and-replace would have made that cell wrong.
- **The star and fork counts have not moved** (4,929 / 1,228 against the 4,928 / 1,228 recorded
  above), so nothing else in the BoxyHQ row is stale.
- **The funnel reading gets sharper, and it is now the vendor's own words.** Ory's README says the
  paid network's "**SAML & SCIM** on Ory Network are powered by Ory Polis", and there is a separate
  paid Ory Enterprise License build for on-premise use. So the free tier is the free tier of
  somebody's commercial product — as it always was — except that the somebody changed, which makes
  its maintenance trajectory a business decision taken elsewhere. That is the class ADR-007's
  freshness gate exists to notice, not a licence problem.

**`verifiedOn` in `research/manifest.json` is deliberately NOT moved by this correction.** It reads
2026-09-08 and that is still true: this pass re-read the BoxyHQ and Ory primary sources only, not
MakerKit, Supastarter, ShipFast, Achromatic or nextacular. Moving the date would assert a
re-verification of all of them that nobody performed, and the date is the one thing in this file a
reader is entitled to take literally.

The free options define the gap precisely:

- **`nextjs/saas-starter`** is deliberately minimal and its README _points users at the paid kits_. It
  uses email+password JWTs in cookies, Drizzle, and Postgres — **not Supabase, and not RLS.**
- **nextacular** is the right idea, unmaintained in substance.

## Second correction (2026-09-08): the Supabase-native RLS kits this scan missed

**The sentence that stood here was wrong, and it is quoted before it is corrected:** _"there is no
free, open, tested, Supabase-native, RLS-proven multi-tenant starter."_ Basejump is free, open,
Supabase-native, RLS-based **and ships a real pgTAP suite**. The claim needs narrowing, not
defending. Recorded like the BoxyHQ correction above rather than quietly rewritten, because the
version of this memo that omits the closest competitor is the version a knowledgeable reader uses to
dismiss the rest of it.

Both were read from the source on **2026-09-08**; the figures below are counted, not recalled.

### Basejump — [usebasejump/basejump](https://github.com/usebasejump/basejump), 940 stars

**Shape.** 19 `.sql` files against 2 `.ts`/`.tsx`: a Postgres extension with a thin template, not an
application kit. 13 `create policy` statements. MIT by the text of its `LICENSE.md` (GitHub's
detector reports no licence, because the file is `LICENSE.md` rather than `LICENSE`).

**It ships the thing this project claims the field does not.** `supabase/tests/database/` holds 13
pgTAP files — schema, personal accounts, team accounts, invitations, member removal, roles, billing
functions — and they are adversarial rather than happy-path: **42 `throws_ok`** assertions across at
least eight identities switched with `tests.authenticate_as(…)`, asserting the exact refusal text,
including an anonymous caller and a second user reaching for the first one's account:

```sql
SELECT throws_ok(
  $$ insert into basejump.account_user (account_id, account_role, user_id)
     values ('8fcec130-…', 'owner', tests.get_supabase_uid('test2')) $$,
  'new row violates row-level security policy for table "account_user"'
);
```

It also **published its test tooling for other people** — `supabase_test_helpers`, a separate repo
(131 stars, last pushed 2024-05-15) distributed through database.dev. That is more than any paid kit
in the table above does.

**What it does not do, and this is the whole of the remaining distinction.** No access matrix. No
per-table × command × identity result published anywhere a reader can look without cloning and
running it. No badge. The string `mutation` does not appear in the repository, so nothing establishes
that any of those 42 assertions can fail. And its CI (`.github/workflows/tests.yml`) runs
`supabase test db` **on `pull_request` only** — a direct push to `main` is unverified — pinning
`supabase/setup-cli@v1` at `version: latest`, which is the unpinned-generator problem keelblock's own
DEF-016 exists for.

**On its cadence, carefully.** Last tagged release **v2.0.3, 2024-01-14**. Two commits since
2024-09-01; `HEAD` is a merge dated 2026-08-06. So "abandoned in January 2024" is wrong — it is
near-dormant with occasional patches, which is a different and less flattering-to-us claim. The only
CI run the GitHub API still returns (2026-08-06) was **cancelled**, not failed: it produced no
verdict, and the pull request was merged. That is stated exactly because "their tests fail" would be
the easy sentence and it is not true.

### Supajump — [supajump/supajump](https://github.com/supajump/supajump), 17 stars

Newer, smaller, same architectural position: Next + Supabase, organizations → teams → users, **72
`create policy` statements across 15 SQL files** — more policy than Basejump by some margin. Last
commit 2025-12-11.

**Zero tests of any kind.** No `*.test.*`, no `*.spec.*`, no pgTAP: `plan(` appears in none of its
SQL. Its only GitHub workflows are `claude.yml` and `claude-code-review.yml`. And it carries **no
licence** — no `LICENSE` file and no `license` field in `package.json` — which for a starter kit is
not a detail: absent a licence, the default is all rights reserved.

### What the corrected claim is

Not "nobody tests isolation" — Basejump does, and does it seriously. The distinction that survives is
one this project already lives by:

> **Shipping runnable tests is not publishing a result, and a passing suite is not a suite shown able
> to fail.**

A reader who wants to know whether Basejump's isolation holds must clone it, install its helpers,
start a stack and run it — and when it passes they have a green line, not a per-table × command ×
identity matrix, and no evidence that a green line was ever capable of being red. That is the gap,
and it is narrower and more defensible than the one this memo originally claimed.

Four thousand nine hundred stars have still accumulated on a kit (BoxyHQ) whose isolation is a
function call each route must remember.

**What BoxyHQ is better at, and keelblock should not pretend otherwise:** enterprise surface (SSO, SCIM,
audit logs, webhooks, API keys — all _delegated to services_ rather than built, which is the right
instinct), i18n done properly, dead-code detection via `knip`, page-object fixtures in its e2e
suite, and — the hardest thing to copy — distribution: 30 contributors and a thousand forks.

## What the field is criticized for

Consistent across every independent comparison, and these are keelblock's design constraints, not
marketing copy:

1. **Bloat** — features you did not want, that you now maintain.
2. **Inflexibility** — _"starting in someone else's code and style is off-putting"_; retrofitting the
   kit's implementation to your need can cost more than writing it yourself.
3. **Untested** — _"a tangled mess of untested, unscalable code that leads you in the totally wrong
   direction."_
4. **The stated gap, verbatim:** _"multi-tenancy, enterprise auth, and audit-grade security are not
   what these tools produce out of the box — they produce a starting point, not a production
   enterprise system."_

Point 4 is the thesis. Points 1–3 are the constraints that stop keelblock becoming what it replaces.

## What this implies

- Competing on **feature count** is losing — Supastarter already ships five payment providers, an AI
  chatbot and i18n. Feature-count is their game and it is the bloat complaint.
- Competing on **provable correctness of the thing everyone gets wrong** is winnable, unoccupied, and
  matches what buyers say is missing.
- Being **free and open** against a $349–1,499 field is a genuine wedge, but only if the quality
  claim survives inspection — a free kit that is merely cheaper is nextacular again.

## Deliberately not lifted from BoxyHQ

Naming these so the choice is a decision rather than an oversight:

- **i18n and `check-locale`.** A real cost for a speculative benefit in a starter; already a stated
  non-goal, and their locale gate only earns its keep once i18n exists.
- **The enterprise feature set.** Registered as DEF-005 (SSO) and DEF-025 (SCIM), not copied — and
  the ordering stands: isolation proven, then table stakes.
- **Page-object boilerplate.** The _pattern_ is settled (SPEC-002 REQ-3b); the code gets written when
  there is a flow to drive, not before.
- **Their RBAC matrix shape.** SPEC-001 REQ-7 already specifies a role model pinned across TypeScript
  and SQL. Theirs is a good confirmation of the shape, not a new idea to import.

**Taken:** the accessible-locator rule (SPEC-002 REQ-3b) and the fetch-then-check contrast
([F-15](../docs/FINDINGS.md)), which is the clearest illustration of keelblock's thesis anyone has written,
including us.

## Sources

**Primary** — each project's own repository, documentation or pricing page. Everything load-bearing
here (stack, tenancy mechanism, test presence, price) was read from the source, not from a review:

- [boxyhq/saas-starter-kit](https://github.com/boxyhq/saas-starter-kit) · cloned and read: `models/`, `lib/guards/`, `prisma/schema.prisma`, `.github/workflows/`
- [usebasejump/basejump](https://github.com/usebasejump/basejump) · cloned and read 2026-09-08: `supabase/tests/database/` (all 13 files), `.github/workflows/tests.yml`, `LICENSE.md`, `git log`/`git tag`, and its CI history via the GitHub API
- [usebasejump/supabase-test-helpers](https://github.com/usebasejump/supabase-test-helpers) · repository metadata read 2026-09-08
- [supajump/supajump](https://github.com/supajump/supajump) · cloned and read 2026-09-08: SQL, workflows, `package.json`, absence of a licence file
- [nextacular/nextacular](https://github.com/nextacular/nextacular) · cloned and read
- [Vercel — Next.js SaaS Starter](https://vercel.com/templates/next.js/next-js-saas-starter)
- [supastarter.dev](https://supastarter.dev) · feature list and pricing, read directly
- [MakerKit](https://makerkit.dev) · pricing and stack, read directly

**Secondary** — comparison write-ups, several vendor-authored. Used to find candidates, never to
establish a fact about one:

- [MakerKit — best Next.js SaaS boilerplates](https://makerkit.dev/blog/saas/best-nextjs-saas-boilerplate) _(vendor-authored; read for its own positioning)_
- [StarterPick — supastarter vs makerkit vs ixartz vs shipfast](https://starterpick.com/guides/supastarter-vs-makerkit-vs-ixartz-vs-shipfast-2026)
- [buildmvpfast — best SaaS boilerplate 2026](https://www.buildmvpfast.com/blog/best-saas-boilerplate-starter-kit-2026-nextjs)
- [SaaS Pegasus — boilerplates and starter kits](https://www.saaspegasus.com/guides/saas-boilerplates-and-starter-kits/) _(the bloat/inflexibility critique)_
- A 2026-09-08 review session's reading of the Basejump and Supajump pages _(used only to find the two candidates; every figure above was then counted in a clone. Two of its specifics did not survive that check — the "January 2024" abandonment, and a characterization of the test suite — which is why it is listed here and not above)_
- [Vercel — Next.js SaaS Starter](https://vercel.com/templates/next.js/next-js-saas-starter)
