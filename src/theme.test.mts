import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripComments, stripCssComments } from '../scripts/prose.mjs';

/**
 * ADR-018 says the colour scheme follows the operating system and there is no toggle. This is the
 * mechanism it never had, and it is written because the decision broke the first time anything
 * touched the stylesheet.
 *
 * `npx shadcn init` rewrites `globals.css` and ships `@custom-variant dark (&:is(.dark *))` — a
 * CLASS, set by a theme toggle it assumes the project has. keelblock refused that toggle on the
 * record, with reasons. Nothing here sets `.dark`, so the default made all 36 `dark:` variants
 * across 13 files dead on arrival and dark mode stopped working (F-67).
 *
 * **The failure is silent in every layer.** A variant that never matches is not an error: the CSS
 * compiles, the build passes, typecheck passes, every test passes, and the page renders — in the
 * light palette, on a machine set to dark. There is no console warning to notice and no screenshot
 * in CI to compare. ADR-018 measured the behaviour, wrote the number down, and left the number as
 * the only thing standing between the decision and a CLI that overwrites it.
 *
 * So this asserts the mechanism rather than the appearance. The CLI will overwrite that line again
 * on the next `shadcn init` or `shadcn add` that touches the theme — that is not a reason to avoid
 * the CLI, it is the reason this file exists.
 */

const CSS = 'src/app/globals.css';

/**
 * Comments stripped, and the reason is F-66 recurring in this very file. The stylesheet explains
 * WHY shadcn's `&:is(.dark *)` is refused, by quoting it — and the rule forbidding that string
 * failed on the comment defending it. A text-matching rule needs this on the day it is written.
 */
describe('ADR-018 · the colour scheme follows the operating system', () => {
  const css = () => stripCssComments(readFileSync(CSS, 'utf8'));

  it('keys the dark variant on the operating system, not on a class', () => {
    expect(
      css(),
      `${CSS} must declare @custom-variant dark (@media (prefers-color-scheme: dark)). ` +
        `shadcn's default is a .dark CLASS, which nothing in this project sets — taking it makes ` +
        `every dark: variant dead and dark mode stops working with no error anywhere (ADR-018, F-67)`,
    ).toContain('@custom-variant dark (@media (prefers-color-scheme: dark))');
  });

  it('MUTATION: the class-based variant shadcn ships is refused', () => {
    // The exact string the CLI writes. If it comes back, this is the test that says so.
    expect(css()).not.toContain('&:is(.dark *)');
  });

  it('MUTATION: the dark palette is not scoped to a .dark class block', () => {
    // The tokens themselves are upstream's and are not edited — only the selector they hang from.
    expect(css()).not.toMatch(/^\.dark\s*\{/m);
    expect(css()).toMatch(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{/);
  });

  it('there is no theme toggle, which is the decision rather than an omission', () => {
    // ADR-018 refused B (localStorage + pre-paint script) and C (cookie or column) with reasons.
    // A toggle arriving without amending that ADR is the thing to catch.
    const setsDarkClass = /classList\.(add|toggle)\(\s*['"]dark['"]|documentElement\.className\s*=/;
    expect(css()).not.toMatch(setsDarkClass);
  });
});

/**
 * F-70. A CSS custom property that references itself is a cycle: the declaration is invalid at
 * computed-value time and the property falls back as though it were never set.
 *
 * `shadcn init` overwrote `--font-sans: var(--font-geist-sans)` with `--font-sans: var(--font-sans)`
 * and every page in the application rendered in the browser's default serif. Nothing could notice.
 * The CSS is syntactically valid, so it compiles; the build passes; typecheck passes; every test
 * passes; the font Next loads is still fetched and still applied to `<body>`, so even the network
 * tab looks right. The only symptom is that the page is in Times New Roman, and the only instrument
 * that catches that is a person looking at it — which is Theme 4 of the review that found it.
 *
 * The rule is mechanical, so it is a rule rather than a habit.
 */
describe('the token set has no self-referential declarations', () => {
  const css = () => stripCssComments(readFileSync(CSS, 'utf8'));

  it('no custom property is defined as a reference to itself', () => {
    const cycles = [...css().matchAll(/(--[\w-]+)\s*:\s*var\(\s*(--[\w-]+)\s*\)/g)]
      .filter((m) => m[1] === m[2])
      .map((m) => m[1]);
    expect(
      cycles,
      `a custom property defined as itself is an invalid cycle — the property falls back as though ` +
        `it were never set, and nothing else in this build can fail because of it (F-70)`,
    ).toEqual([]);
  });

  it('the sans font resolves to the family the layout actually loads', () => {
    // `next/font` names the variable; the theme has to reference THAT name. The two live in
    // different files, which is how they drifted.
    const layout = readFileSync('src/app/[locale]/layout.tsx', 'utf8');
    const loaded = [...layout.matchAll(/variable:\s*'(--[\w-]+)'/g)].map((m) => m[1]);
    expect(loaded).toContain('--font-geist-sans');
    expect(css()).toMatch(/--font-sans:\s*var\(--font-geist-sans\)/);
  });

  it('the font variables are in scope for the element that consumes them', () => {
    // The assertion above passed while every page still rendered in serif, which is the whole
    // lesson: the token was spelled correctly in both files and was still out of SCOPE. `next/font`
    // was putting `--font-geist-sans` on `<body>`, and `globals.css` applies `font-sans` to `html`
    // — one level up, where the property does not exist. A custom property that is out of scope is
    // not an error; the declaration is dropped and the element falls back to the browser default.
    //
    // So this checks the relationship rather than either half of it: whichever element the theme
    // applies `font-sans` to must be the element the layout defines the variables on.
    // Comments stripped, and it caught this test on its first run: the comment written INTO the
    // layout to explain why the variables moved says "<html>", and the regex matched that instead
    // of the element. F-64, F-66, F-67, and now here — the fourth time, in the fix for the third.
    const layout = stripComments(readFileSync('src/app/[locale]/layout.tsx', 'utf8'));
    const appliesTo = /(\w+)\s*\{[^}]*@apply[^;}]*\bfont-sans\b/.exec(css())?.[1];
    expect(appliesTo, 'nothing in globals.css applies font-sans').toBeDefined();
    expect(appliesTo).toBe('html');

    const htmlTag = /<html[^>]*>/.exec(layout)?.[0] ?? '';
    expect(
      htmlTag,
      `<html> must carry the font variables, because globals.css resolves them there`,
    ).toMatch(/geistSans\.variable/);
    expect(htmlTag).toMatch(/geistMono\.variable/);
  });
});
