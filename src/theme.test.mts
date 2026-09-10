import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripCssComments } from '../scripts/prose.mjs';

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
