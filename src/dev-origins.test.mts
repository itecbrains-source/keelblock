import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * F-65, and the second time this project has paid for it.
 *
 * `next dev` serves the HMR socket and its client runtime only to the origin it advertises —
 * `localhost` — and refuses them to `127.0.0.1`, which it treats as a different origin. The page
 * still arrives, fully server-rendered and correct, and then never hydrates. Nothing throws. The
 * browser console shows a failed WebSocket and nothing else. A Server Action form still works,
 * because a form posts natively without JavaScript, so the only visible symptom is that buttons
 * with `onClick` do nothing.
 *
 * The first sighting is in `docs/TESTING.md`: a trial lost an afternoon to a form that submitted and
 * changed nothing, and found the cause "only by reading the dev-server log". That was written down
 * as a story about the trial rather than as a fix or a rule, and so it happened again — this time to
 * the owner, on the OAuth button, where it was filed as "the provider button does not respond to
 * clicks". This project's stated position is that a rule with no gate is not a rule. This is the
 * gate.
 *
 * Read with the TypeScript parser rather than imported: importing `next.config.ts` pulls in the
 * next-intl plugin and evaluates the whole config, and the question here is about what the file
 * SAYS, which is what a reader deleting the line would change.
 */
function allowedDevOrigins(): string[] {
  const source = ts.createSourceFile(
    'next.config.ts',
    readFileSync('next.config.ts', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: string[] = [];
  const walk = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText() === 'allowedDevOrigins' &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const el of node.initializer.elements) if (ts.isStringLiteral(el)) found.push(el.text);
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
  return found;
}

describe('development works on the host our own instructions hand out', () => {
  /**
   * Not an arbitrary list. `supabase status` prints `http://127.0.0.1:54721`, the GitHub OAuth app's
   * redirect URIs are registered against that host, and the getting-started page uses it throughout —
   * so `127.0.0.1` is where following keelblock's own setup actually puts a reader. `localhost` is
   * where `next dev` puts them. Both have to work, because both are reachable by doing as we say.
   */
  const REQUIRED = ['127.0.0.1', 'localhost'];

  it('every host keelblock sends a developer to is an allowed dev origin', () => {
    const allowed = allowedDevOrigins();
    for (const host of REQUIRED) {
      expect(
        allowed,
        `next.config.ts must list "${host}" in allowedDevOrigins — without it \`next dev\` refuses ` +
          `its own HMR and client runtime to that origin, the app renders but never hydrates, and ` +
          `the only symptom is that buttons silently stop working (F-65)`,
      ).toContain(host);
    }
  });

  it('MUTATION: an empty or missing declaration is caught', () => {
    // The failure mode this guards against is deletion — the line looks like configuration nobody
    // needs, and removing it breaks only development, silently, for whoever clones next.
    expect(allowedDevOrigins().length).toBeGreaterThan(0);
  });
});
