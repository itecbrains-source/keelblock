import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

/**
 * SPEC-002 REQ-3b — accessible locators only, enforced.
 *
 * The requirement was settled before the first journey test existed, and its acceptance criterion
 * cited the page objects as evidence. That is a file that complies, not a check that fails:
 * appending `getByTestId('members').locator('.row')` to `e2e/pages/index.ts` left `tsc`, `lint`,
 * `unit` and `boundaries` all green — measured.
 *
 * It matters more than it looks. Accessible locators are the only reason the journey suite doubles
 * as an accessibility regression test, so bar B-7 was partly resting on a property nothing checked.
 *
 * **Parsed, not grepped.** The forbidden names appear in prose all over this repository — including
 * in the comment you are reading — so a text search reports its own explanation. The TypeScript AST
 * answers the question that is actually being asked: is this a CALL, in code?
 */

/** Locators that resolve by something a user cannot perceive. */
const FORBIDDEN_CALLS = new Set(['getByTestId']);

/**
 * `locator()` is not banned outright. `locator('..')` — Playwright's parent idiom, which resolves
 * structurally rather than by appearance — and chaining off an accessible locator are legitimate,
 * and the first version of this rule rejected the parent idiom until a passing case caught it. What is banned is a CSS or XPath string, which is the form that survives a markup
 * change while asserting nothing about the interface.
 */
const CSS_OR_XPATH = /^\s*[.#[/]|\s>\s|:nth-|::/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

export function findInaccessibleLocators(files: string[], read: (f: string) => string): string[] {
  const problems: string[] = [];
  for (const file of files) {
    const src = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression.name.text;
        const [first] = node.arguments;

        if (FORBIDDEN_CALLS.has(method)) {
          problems.push(
            `${file}: \`${method}(…)\` resolves by something no user can perceive. Use getByRole, ` +
              `getByLabel or getByPlaceholder — a control that loses its accessible name should ` +
              `break a test (SPEC-002 REQ-3b).`,
          );
        }
        const isParentIdiom = first && ts.isStringLiteral(first) && first.text.trim() === '..';
        if (
          method === 'locator' &&
          first &&
          ts.isStringLiteral(first) &&
          !isParentIdiom &&
          CSS_OR_XPATH.test(first.text)
        ) {
          problems.push(
            `${file}: \`locator('${first.text}')\` is a CSS or XPath selector. It survives a markup ` +
              `change while asserting nothing about the interface, which is why most suites reach ` +
              `for one and quietly stop testing the real thing (SPEC-002 REQ-3b).`,
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
  }
  return problems;
}

const read = (f: string) => readFileSync(f, 'utf8');

describe('the journey suite uses accessible locators only', () => {
  it('the real suite is clean — and there is a suite to be clean', () => {
    const files = walk('e2e');
    expect(files.length, 'no journey files found; this test would pass vacuously').toBeGreaterThan(
      3,
    );
    expect(findInaccessibleLocators(files, read)).toEqual([]);
  });

  it('MUTATION: a test id fails', () => {
    // The exact edit that was green everywhere before this test existed.
    const src = `export const cheat = (p: Page) => p.getByTestId('members');`;
    expect(findInaccessibleLocators(['f.ts'], () => src)[0]).toMatch(/no user can perceive/);
  });

  it('MUTATION: a CSS selector fails', () => {
    const src = `export const cheat = (p: Page) => p.locator('.row > td:nth-child(2)');`;
    expect(findInaccessibleLocators(['f.ts'], () => src)[0]).toMatch(/CSS or XPath/);
  });

  it('MUTATION: an XPath selector fails', () => {
    const src = `export const cheat = (p: Page) => p.locator('//tr[2]');`;
    expect(findInaccessibleLocators(['f.ts'], () => src)[0]).toMatch(/CSS or XPath/);
  });

  it('the accessible locators pass', () => {
    const src = [
      `p.getByRole('button', { name: 'Create' });`,
      `p.getByLabel('Email address');`,
      `p.getByPlaceholder('you@example.com');`,
      `p.getByText(/on its way/i);`,
      `row.locator('..');`,
    ].join('\n');
    expect(findInaccessibleLocators(['f.ts'], () => src)).toEqual([]);
  });

  it('reads code, not prose — a comment naming the rule is not a violation', () => {
    // The reason this is parsed. Every string below appears in this repository's own explanations.
    const src = [
      `// Never getByTestId, never locator('.row') — see SPEC-002 REQ-3b.`,
      `/** getByTestId and .locator('#id') are both forbidden. */`,
      `const doc = "we do not use getByTestId here";`,
      `p.getByRole('link', { name: 'Docs' });`,
    ].join('\n');
    expect(findInaccessibleLocators(['f.ts'], () => src)).toEqual([]);
  });
});
