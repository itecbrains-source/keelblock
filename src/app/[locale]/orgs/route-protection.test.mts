import { describe, expect, it, vi } from 'vitest';
// `unstable_doesMiddlewareMatch`, not `unstable_doesProxyMatch`. Next 16.3.4's own documentation
// names the latter — the rename reached the docs and not the build. Measured against the installed
// package, which is the only version that can be wrong at runtime (F-37).
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Read the matcher out of `src/proxy.ts` with the TypeScript parser.
 *
 * Not an import: Next requires the matcher to be a static literal in that file and refuses to build
 * when it is a variable, so there is nothing to import. Not a regular expression either — this is a
 * question about the shape of the source, and a parser answers it exactly where a pattern would
 * merely usually agree.
 */
function proxyMatcher(): string[] {
  const src = ts.createSourceFile(
    'proxy.ts',
    readFileSync('src/proxy.ts', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: string[] = [];
  const walk = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      node.name.getText() === 'matcher' &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const el of node.initializer.elements) {
        if (ts.isStringLiteral(el)) found.push(el.text);
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(src);
  if (found.length === 0) throw new Error('no static matcher found in src/proxy.ts');
  return found;
}

/**
 * SPEC-004 REQ-5 and REQ-1, writable now that SPEC-005 has created a route to protect.
 *
 * Two independent statements, and the distinction is the whole requirement: matcher coverage is a
 * redirect-to-login convenience, and the route's own data path is the thing standing between a
 * stranger and a row.
 */

describe('route protection is asserted coverage, not an assumption', () => {
  const authenticated = ['/orgs', '/en/orgs'];

  it('AC-7 · every authenticated route is covered by the proxy matcher', () => {
    // Read from the matcher rather than by eye. It is a regex with negative lookaheads, and
    // reviewing one by inspection is how a route quietly stops being covered.
    for (const url of authenticated) {
      expect(
        unstable_doesMiddlewareMatch({ config: { matcher: proxyMatcher() }, nextConfig: {}, url }),
      ).toBe(true);
    }
  });

  it('the auth callback is deliberately EXCLUDED, and that is not an oversight', () => {
    // next-intl would redirect it to a locale prefix and the code would never be exchanged. It
    // writes its own session cookies with a response it owns.
    expect(
      unstable_doesMiddlewareMatch({
        config: { matcher: proxyMatcher() },
        nextConfig: {},
        url: '/auth/callback',
      }),
    ).toBe(false);
  });

  it('AC-8 · the refusal does not live in the matcher — a route it excludes still refuses', () => {
    // The boundary is the route's data path. Proven structurally against the real file: the proxy
    // contains no authorization call, and the page calls getCurrentUser before rendering anything.
    const proxy = readFileSync('src/proxy.ts', 'utf8');
    expect(proxy).not.toMatch(/getCurrentUser|requireUser|redirect\(/);

    const page = readFileSync('src/app/[locale]/orgs/page.tsx', 'utf8');
    expect(page).toMatch(/getCurrentUser\(\)/);
    expect(page).toMatch(/redirect\(/);
    // And the check sits INSIDE the Suspense boundary with the data, not in the static shell —
    // measured: at the top level the shell flushed 200 before the redirect could run.
    expect(page).toMatch(/<Suspense[\s\S]*<Organizations \/>/);
  });
});

describe('the protected route refuses an unauthenticated caller', () => {
  it('AC-1, AC-2, AC-9 · it redirects, and it does so from its own data path', async () => {
    // A forged `x-middleware-subrequest` (GHSA-f82v-jwr5-mffw) walks past the proxy. It cannot walk
    // past this, because this check is not in the proxy — the page asks the DAL itself.
    const redirect = vi.fn(() => {
      throw new Error('NEXT_REDIRECT');
    });
    vi.doMock('next/navigation', () => ({ redirect }));
    vi.doMock('@/lib/auth/dal', () => ({ getCurrentUser: async () => null }));
    vi.doMock('next-intl/server', () => ({ getTranslations: async () => (k: string) => k }));
    vi.doMock('@/lib/orgs/dal', () => ({
      listMemberships: async () => [],
      activeOrg: async () => null,
      listMembers: async () => [],
    }));
    // Mocked for the same reason as the DAL: it is `server-only`, so importing the page without it
    // fails on the import rather than on the assertion. The refusal happens before either is read.
    vi.doMock('@/lib/orgs/invitations', () => ({ listInvitations: async () => [] }));
    vi.doMock('next/headers', () => ({ headers: async () => new Headers() }));

    // The session-dependent component, not the default export: that one wraps this in <Suspense>
    // and so never awaits it. Measured — asserting against the wrapper passed while proving nothing.
    const { Organizations } = await import('@/app/[locale]/orgs/page');
    await expect(Organizations()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith('/login?next=/orgs');
    vi.resetModules();
  });
});
