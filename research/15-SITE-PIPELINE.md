# Publishing keelblock.dev: what actually renders the content, and the two constraints nobody wrote down

_Researched 2026-09-10, for SPEC-032. Package facts are from the npm registry read on that date;
the framework constraints are from Next.js's own documentation for 16.3.4, which is the version this
repository pins. The tension at the end is a finding, not a decision — SPEC-032 decides._

## The question

`docs/WEBSITE-AND-DOCS.md` plans keelblock.dev in detail — seven landing sections, five documentation
sections, a material pipeline that already routes every finding to a destination — and then says
plainly that **the content source is unspecified**: "Nothing in the repository names MDX, markdown or
any other pipeline." F-69 recorded the consequence: `check-content` proves a destination was NAMED
and nothing proves it EXISTS, so the gate passes indefinitely while nothing is published.

So the question is narrow: **what renders the content, and what does that choice cost?** Not "which
docs framework is nicest" — the plan already fixes the structure and the argument order. The spec
needs a pipeline it can write acceptance criteria against.

## What is actually maintained, from the registry rather than from blog posts

Read from `registry.npmjs.org` on 2026-09-10. This corrects two claims that a web search returns
confidently and that are both wrong.

```
@next/mdx      16.3.4    2026-08-31   peers @mdx-js/react, @mdx-js/loader
fumadocs-ui    16.15.8   2026-09-07   peers next 16.x, react ^19.2
fumadocs-mdx   15.4.0    2026-08-27   peers next ^15.3 || ^16
velite          0.4.0    2026-06-17   pre-1.0
nextra          4.6.1    2025-12-04   peers next >=14
contentlayer2   0.5.8    2025-05-03
```

**The two corrections.** A search for Contentlayer alternatives returns "the community fork
Contentlayer2 is the production path" — its last publish is **sixteen months old**. The same searches
recommend Nextra as the mature option; its last publish is **nine months old** and its peer range
still says `next >=14`, which is not a statement that anyone has run it on 16. Neither is a claim a
spec should rest on, and neither would have been caught by reading the summaries.

**`@next/mdx` is versioned in lockstep with Next itself** — 16.3.4, the exact version this repository
pins, published within a week of this reading. That is the strongest maintenance signal available in
this category: it is not a package that tracks Next, it is a package that ships with it.

Fumadocs is genuinely alive and genuinely Next-16-native — `fumadocs-ui` published three days before
this reading, peers pinned at `next 16.x`. It is also a documentation _framework_ with its own
layout, navigation and theme, which is a large surface to adopt for a project that has just spent an
ADR on owning its own component layer.

## Constraint 1 — Turbopack cannot take a plugin that is a function

From the Next.js 16.3.4 documentation, verbatim:

> remark and rehype plugins without serializable options cannot be used yet with Turbopack, because
> JavaScript functions can't be passed to Rust.

Plugins must be named as **strings** with serializable options:

```js
const withMDX = createMDX({
  options: {
    remarkPlugins: ['remark-gfm', ['remark-toc', { heading: 'The Table' }]],
    rehypePlugins: ['rehype-slug'],
  },
});
```

This repository builds with Turbopack — `▲ Next.js 16.3.4 (Turbopack)` on every build. So the
ordinary MDX setup that every tutorial shows, importing a plugin and passing the function, **does not
work here**. It is not a subtle degradation either way: the string form works, the function form is
refused.

Two more facts from the same page, both of which shape a spec:

- **`@next/mdx` does not support frontmatter.** It offers `export const metadata` inside the MDX
  instead, or a remark plugin. The material pipeline in `MANIFEST.json` already carries the metadata
  that would otherwise live in frontmatter, which makes this less of a gap here than it looks.
- **`mdx-components.tsx` at the project root is required** for App Router and it will not work
  without it. The Rust MDX compiler (`experimental.mdxRs`) is documented as experimental and "not
  recommended for production use".

## Constraint 2 — the search bar and the hosting decision are in tension

`WEBSITE-AND-DOCS.md` borrows supastarter's finish as the bar: "clear writing, a real demo, honest
changelog, **working search**, no dead links."

Pagefind is the obvious answer — v1.5.0, Rust, builds an index at build time, ships as static files,
no API key, no per-query billing, no query logging, and it can be cached at the edge with no
configuration. Its requirement is the problem, and it is stated by Pagefind itself: it indexes
**static HTML output**, and it "cannot index dynamic or server-rendered content."

ADR-024 chose Vercel over static hosting for a stated reason — "the site will not stay static. The
proof page regenerates per CI run … Static-export hosting forecloses all three." Every route in this
repository currently builds as `◐ Partial Prerender`: a static shell with server-streamed content.

So these do not obviously compose. **This memo does not resolve that**, and says so
rather than picking:

- Pagefind can index whatever HTML a build emits, so documentation pages that are fully prerendered
  are indexable even if the proof page is not. Search over the docs and not over a live matrix may be
  exactly the right scope — but that is a decision with a cost, not an obvious win.
- Algolia DocSearch is free for open-source documentation and around $49/month otherwise. Free would
  apply here. It also means the search index lives on someone else's infrastructure and queries are
  logged, which is a claim keelblock would then be making about its readers.

The honest position for SPEC-032 is that **search is a separate acceptance criterion from the content
pipeline**, and it may be the one that is deferred rather than the one that is guessed.

## What this memo does not establish

Stated because a memo that only lists what it found reads as more complete than it is.

- **It was not built.** No pipeline was installed, no page was rendered, and the Turbopack string-plugin
  constraint was read rather than hit. The first spike may correct this memo, which is the point of
  writing it first.
- **Fumadocs was not evaluated in place.** Its registry health is strong and its Next 16 support is
  declared; whether its layout can carry the seven-section landing page the plan already specifies is
  unknown, and the plan's structure is not negotiable to fit a theme.
- **The external-CMS option is untested.** `WEBSITE-AND-DOCS.md` notes that a CMS for keelblock.dev
  "would not contradict the kit's refusal, though it would want its own reasoning." No CMS was
  assessed here; the reasoning it would want has not been written.
- **Nothing was measured about build time or index size**, which is the usual reason a content
  pipeline gets replaced a year later.

## Sources

**Primary**

- [Next.js 16.3.4 — How to use markdown and MDX](https://nextjs.org/docs/app/guides/mdx) — the
  Turbopack serializable-plugin constraint, the frontmatter gap, the `mdx-components.tsx`
  requirement, and `mdxRs` being experimental. Page metadata records version 16.3.4, last updated
  2026-08-25.
- [Pagefind](https://pagefind.app/) — v1.5.0, static-HTML indexing, and the stated inability to index
  dynamic or server-rendered content.
- `registry.npmjs.org`, read 2026-09-10 — publish dates and peer ranges for `@next/mdx`,
  `fumadocs-mdx`, `fumadocs-ui`, `velite`, `nextra`, `contentlayer2`. The registry is the reason the
  two corrections above are corrections.

**Secondary, and treated as such**

- [Fumadocs documentation](https://www.fumadocs.dev/docs/mdx/next) — consulted for Next.js support
  and version claims; the page states only that Fumadocs MDX is ESM-only and did not answer the
  version question, so the registry was used instead.
- Search-result summaries recommending Contentlayer2 and Nextra. Recorded here because they are
  **wrong**, and because the failure mode is worth naming: a summary reports what was true when the
  posts it summarises were written.
