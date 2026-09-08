#!/usr/bin/env node
/**
 * SPEC-003 REQ-3 and REQ-4 — the application cannot route around RLS.
 *
 * Every other gate proves the database enforces isolation. These two prove the app does not step
 * around it, and they guard the only two ways it can:
 *
 *   REQ-3 · the **service-role client** bypasses RLS entirely. Reachable from a rendered page, it is
 *           a total isolation bypass that no policy and no test in this repository would see.
 *           Resolved through the **import graph**, not a filename convention — a rule you can defeat
 *           by moving a file is not a boundary.
 *
 *   REQ-4 · a **cached** value whose key omits the tenant is served from cache and never reaches the
 *           database, so RLS is bypassed by construction. Next refuses `cookies()` inside
 *           `use cache` (F-6), which kills the naive case — the surviving risk is the escape hatch
 *           its own error message recommends: read the session outside, pass a value in. That is
 *           legitimate, and it is only safe if the organization arrives as an ARGUMENT, which Next
 *           keys on. Captured from an outer scope or defaulted, it is one tenant's data served to
 *           the next.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import ts from 'typescript';

const SRC = 'src';
const ADMIN = 'src/lib/supabase/server-only/admin.ts';
const CODE = ['.ts', '.tsx'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (CODE.includes(extname(p))) out.push(p);
  }
  return out;
}

/**
 * Resolve a relative or `@/`-aliased import to a real file. Exported for tests.
 * @param {string} spec
 * @param {string} fromFile
 * @param {(p: string) => boolean} [exists]
 * @returns {string | null}
 */
export function resolveImport(spec, fromFile, exists = (p) => existsSync(p)) {
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return null;
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : resolve(dirname(fromFile), spec);
  for (const suffix of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    if (exists(base + suffix) && extname(base + suffix)) return base + suffix;
  }
  return null;
}

/** @param {string} source @param {string} [file] */
const parse = (source, file = 'f.tsx') =>
  ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.TSX,
  );

/** @param {ts.Node} node @param {(n: ts.Node) => void} fn */
function walkAst(node, fn) {
  fn(node);
  ts.forEachChild(node, (c) => walkAst(c, fn));
}

/**
 * Every module this file pulls in, from the PARSED source.
 *
 * The previous version was one regex over `import ... from '...'`, which missed four legal forms —
 * `export * from`, `export { x } from`, dynamic `await import()` and `require()`. It failed OPEN: an
 * unparsed import is a path not walked, reported as clean. A `lib/queries/index.ts` barrel that
 * re-exports the admin client is the ordinary way a directory is organized, and it was invisible to
 * the gate whose entire purpose is to find exactly that, two hops deep.
 *
 * @param {string} source @param {string} [file] @returns {string[]}
 */
export function importsOf(source, file) {
  /** @type {string[]} */ const out = [];
  walkAst(parse(source, file), (n) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteralLike(n.moduleSpecifier)) {
      out.push(n.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(n) &&
      n.moduleSpecifier &&
      ts.isStringLiteralLike(n.moduleSpecifier)
    ) {
      out.push(n.moduleSpecifier.text);
    } else if (ts.isCallExpression(n)) {
      const dynamic = n.expression.kind === ts.SyntaxKind.ImportKeyword;
      const required = ts.isIdentifier(n.expression) && n.expression.text === 'require';
      const arg = n.arguments[0];
      if ((dynamic || required) && arg && ts.isStringLiteralLike(arg)) out.push(arg.text);
    }
  });
  return out;
}

/**
 * Walk the import graph from each rendered entry point and report any path reaching the
 * service-role client. Returns the full chain, because "admin.ts is reachable" is useless and
 * "page → dashboard → queries → admin" is actionable. Exported for tests.
 */
export function findAdminReachableFrom(entries, read, resolveFn) {
  const problems = [];
  for (const entry of entries) {
    const seen = new Set();
    const stack = [[entry, [entry]]];
    while (stack.length) {
      const [file, path] = stack.pop();
      if (seen.has(file)) continue;
      seen.add(file);
      if (file.endsWith('server-only/admin.ts')) {
        problems.push(
          `${path.join(' → ')}\n      a rendered page can reach the service-role client, which bypasses RLS entirely`,
        );
        continue;
      }
      let source;
      try {
        source = read(file);
      } catch {
        continue;
      }
      for (const spec of importsOf(source, file)) {
        const target = resolveFn(spec, file);
        if (target) stack.push([target, [...path, target]]);
      }
    }
  }
  return problems;
}

/** A `use cache` function reaching tenant data must take its organization as a parameter. */
/**
 * @param {string[]} files
 * @param {(f: string) => string} read
 * @returns {string[]}
 */
export function findUnkeyedCaches(files, read) {
  /** @type {string[]} */ const problems = [];
  const KEYED = /organi[sz]ation|orgId|org_id|\borg\b/i;
  const FN = (n) =>
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n);

  /** The name a reader would recognize, whatever shape the function was written in. */
  const nameOf = (fn) => {
    if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
    const p = fn.parent;
    if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    if (p && ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text;
    return '(anonymous)';
  };

  const unkeyed = (fn) => !KEYED.test(fn.parameters.map((x) => x.getText()).join(','));

  for (const file of files) {
    const source = read(file);
    if (!/['"]use cache['"]/.test(source)) continue;
    const sf = parse(source, file);

    /** A directive is an expression statement whose whole expression is the string. */
    const directives = [];
    walkAst(sf, (n) => {
      if (
        ts.isExpressionStatement(n) &&
        ts.isStringLiteralLike(n.expression) &&
        n.expression.text === 'use cache'
      ) {
        directives.push(n);
      }
    });

    for (const d of directives) {
      // Nearest enclosing function, whatever its shape: declaration, arrow, method, expression.
      let owner = d.parent;
      while (owner && !FN(owner) && !ts.isSourceFile(owner)) owner = owner.parent;

      if (owner && FN(owner)) {
        if (unkeyed(owner)) {
          problems.push(
            `${file}: "${nameOf(owner)}" is cached but takes no organization parameter. ` +
              `Next keys the cache on arguments — a tenant captured from scope is not in the key, ` +
              `so one tenant's data is served to the next.`,
          );
        }
        continue;
      }

      // A FILE-LEVEL directive caches every export in the module. The old rule pre-filtered on the
      // string, then found no `function` declarations, then reported nothing — the widest possible
      // version of the defect was the one it could not see.
      const exported = [];
      walkAst(sf, (n) => {
        if (!FN(n)) return;
        const decl = ts.isArrowFunction(n) || ts.isFunctionExpression(n) ? n.parent?.parent : n;
        const mods = ts.canHaveModifiers(decl) ? (ts.getModifiers(decl) ?? []) : [];
        if (mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) exported.push(n);
      });
      for (const fn of exported.filter(unkeyed)) {
        problems.push(
          `${file}: "${nameOf(fn)}" is cached by the file-level 'use cache' directive and takes no ` +
            `organization parameter. Next keys the cache on arguments — a tenant captured from ` +
            `scope is not in the key, so one tenant's data is served to the next.`,
        );
      }
    }
  }
  return problems;
}

/**
 * Import cycles. A cycle breaks tree-shaking, makes module initialization order undefined, and makes
 * the code impossible to reason about one file at a time — and it is invisible until something
 * mysteriously imports as `undefined`.
 *
 * Built here rather than adding `madge` or `dependency-cruiser`: the graph walk already exists, and
 * a dependency to replace ten working lines is the wrong direction (ADR-013).
 *
 * @param {string[]} files @param {(f: string) => string} read
 * @param {(spec: string, from: string) => string | null} resolveFn @returns {string[]}
 */
export function findCycles(files, read, resolveFn) {
  /** @type {string[]} */ const cycles = [];
  const seen = new Set();

  const visit = (file, stack) => {
    const at = stack.indexOf(file);
    if (at !== -1) {
      const loop = [...stack.slice(at), file];
      // Normalize by MEMBERS, not by the walked sequence: a→b→a and b→a→b are the same cycle, and
      // sorting the sequence gives them different keys because the entry point appears twice.
      const key = [...new Set(loop)].sort().join('|');
      if (!seen.has(key)) {
        seen.add(key);
        cycles.push(loop.join(' → '));
      }
      return;
    }
    if (stack.length > 40) return;
    let source;
    try {
      source = read(file);
    } catch {
      return;
    }
    for (const spec of importsOf(source, file)) {
      const target = resolveFn(spec, file);
      if (target) visit(target, [...stack, file]);
    }
  };
  for (const f of files) visit(f, []);
  return cycles.map((c) => `import cycle: ${c}`);
}

/**
 * Every file the outside world can reach.
 *
 * `route.ts` was missing, and it is the one that matters most: ADR-011 draws the architecture down
 * the middle of this gap — "Server Actions for the app, **Route Handlers for the outside world**" —
 * so the file type designated to receive unauthenticated external traffic was the single file type
 * the isolation boundary did not walk. There are none in the tree today, which is why this was a
 * hole rather than a defect, and why it is being closed now: it stops being theoretical at three
 * named points on the roadmap (SPEC-007's Stripe webhook, SPEC-026's API keys, SPEC-027's outbound
 * webhooks), and every one of them lands in a `route.ts`.
 *
 * A standalone `actions.ts` is included for the same reason — a Server Action is a network boundary
 * wearing a function's clothes (ADR-011), and it is only walked today when a page imports it.
 * @param {string} file
 */
export const isEntryPoint = (file) =>
  /\/(page|layout|template|default|error|loading|not-found|route|actions)\.tsx?$/.test(file);

/**
 * Route handlers that may legitimately hold the service role, each with a reason.
 *
 * Empty, deliberately: the Stripe webhook (SPEC-007) is the canonical legitimate consumer and does
 * not exist yet. It lives here rather than as a per-file comment so that granting the bypass is a
 * one-line diff in a reviewed list — a review artifact rather than an exception nobody sees.
 * @type {Array<{file: string, reason: string}>}
 */
export const SERVICE_ROLE_ALLOWED = [];

/**
 * Contexts with no response to put headers on. **Compared by value in the test, not counted** —
 * a capped list permits swapping one member for another, which is how an allowlist leaves a
 * guarantee without ever growing (F-30).
 */
export const CACHE_HEADER_EXEMPT = [
  {
    file: 'src/lib/supabase/server.ts',
    reason:
      'Server Components cannot write cookies at all, and Server Actions answer an uncacheable ' +
      'POST with no response object to hold headers. MEASURED 2026-09-08: signInWithOtp does ' +
      'supply headers here on its first write, and there is nowhere to apply them. Every GET path ' +
      'that may rotate a session uses response-client.ts instead.',
  },
];

/**
 * SPEC-004 REQ-4 — a `setAll` that cannot receive its cache headers.
 *
 * This lives in the boundaries gate rather than a twelfth script because it is the SAME question
 * REQ-4 already asks — *can a response carrying tenant data be cached?* — about the cookie that
 * identifies the tenant. SPEC-003 makes the gate count a ceiling and the external review's position
 * is that eleven is already more than the application justifies.
 *
 * The defect is real and was in this repository: `setAll: (list) => …` in `server.ts`, one
 * parameter, so the headers the library supplies were not ignored — they were never received. From
 * `@supabase/ssr`'s own type definitions: responses that set auth cookies "must not be cached by
 * CDNs or reverse proxies, otherwise one user's session token can be served to a different user."
 *
 * Shape, not behavior: the behavioral proof is `src/lib/supabase/proxy.test.mts`, which drives a
 * refresh and reads the response. This catches the version of the mistake that a test cannot,
 * because a `setAll` that never receives the headers has nothing to assert about.
 *
 * @param {string[]} files @param {(f: string) => string} read @returns {string[]}
 */
export function findDroppedCacheHeaders(files, read, exempt = CACHE_HEADER_EXEMPT) {
  const problems = [];
  const skip = new Set(exempt.map((e) => e.file));
  for (const file of files) {
    if (skip.has(file)) continue;
    walkAst(parse(read(file), file), (node) => {
      if (!ts.isPropertyAssignment(node)) return;
      if (node.name.getText() !== 'setAll') return;
      const fn = node.initializer;
      if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return;

      if (fn.parameters.length < 2) {
        problems.push(
          `${file}: \`setAll\` takes ${fn.parameters.length} parameter(s). It receives the cookies ` +
            `AND the cache headers that must travel with them — a response that sets an auth cookie ` +
            `and is cacheable serves one user's session token to the next. Take both.`,
        );
        return;
      }
      // Declaring it and never using it is the same defect wearing a correct signature.
      const name = fn.parameters[1].name.getText();
      let used = false;
      walkAst(fn.body, (n) => {
        if (ts.isIdentifier(n) && n.text === name && n.parent !== fn.parameters[1]) used = true;
      });
      if (!used) {
        problems.push(
          `${file}: \`setAll\` declares \`${name}\` and never reads it. The headers are the half ` +
            `that keeps a session cookie out of a shared cache; accepting them and dropping them is ` +
            `the same defect with a correct signature.`,
        );
      }
    });
  }
  return problems;
}

/**
 * Deliberately public Server Actions. **Deny-by-default**: an action not listed here must reach an
 * authorization call, and adding to this list is the only way to opt out — visibly, with a reason,
 * in a diff someone reviews. Compared by value in the test, never counted.
 */
export const PUBLIC_ACTIONS = [
  {
    action: 'requestMagicLink',
    reason:
      'Sign-in itself. Requiring a session to request one is a contradiction. It parses its input, ' +
      'answers identically whether or not an account exists, and is rate-limited by Supabase.',
  },
  {
    action: 'startOAuth',
    reason:
      'Sign-in itself, as above. Returns a provider URL and writes only a PKCE code verifier; it ' +
      'reads no tenant data and mutates nothing.',
  },
];

/** Anything that establishes the caller. The DAL is the only place these live. */
const AUTHORIZERS = ['getCurrentUser'];

/** Every identifier called anywhere inside a node. */
function callsWithin(node) {
  const names = new Set();
  walkAst(node, (n) => {
    if (!ts.isCallExpression(n)) return;
    const target = n.expression;
    if (ts.isIdentifier(target)) names.add(target.text);
    else if (ts.isPropertyAccessExpression(target)) names.add(target.name.text);
  });
  return names;
}

/**
 * SPEC-004 REQ-3 — every Server Action authorizes, or is a declared public one.
 *
 * This is the rule the field does not have, and F-15 is what its absence looks like in the
 * most-starred free kit in the category: `getApiKeyById` fetches any tenant's row by id, and a
 * SEPARATE function the route must remember to call compares the tenant afterwards. Remembering is
 * the part that fails.
 *
 * Next.js documents the exposure in its own words: an exported action "is reachable via a direct
 * POST request, not just through your application's UI… even if [it] is not imported elsewhere in
 * your code", and "a page-level authentication check does not extend to the Server Actions defined
 * within it." Its own mitigations — encrypted action ids, dead-code elimination — are described as
 * reducing risk "in cases where an authentication layer is missing", not as a boundary.
 *
 * **Per action, not per file.** The first version of this asked whether the MODULE reached an
 * authorizer, and its own non-vacuity assertion caught the consequence within the hour: adding an
 * authorizing `signOut` to the sign-in module made two unauthenticated actions beside it look
 * authorized, and emptying the allowlist stopped producing any finding at all. A file-level answer
 * to a per-entry-point question is a check that stops being able to fail as the file grows.
 *
 * Delegation still counts: an action calling a local helper, or a DAL function that authorizes, is
 * correct. Demanding the call be literally inline would train people to satisfy the gate rather
 * than the property.
 *
 * @param {string[]} files @param {(f: string) => string} read
 * @param {(spec: string, from: string) => string | null} resolveFn
 * @param {{action: string, reason: string}[]} [publicActions]
 * @returns {string[]}
 */
export function findUnauthorizedActions(files, read, resolveFn, publicActions = PUBLIC_ACTIONS) {
  const problems = [];
  const exempt = new Set(publicActions.map((a) => a.action));

  /** Does this module call an authorizer anywhere, directly or through what it imports? */
  const moduleAuthorizes = (file, seen = new Set()) => {
    if (seen.has(file) || seen.size > 12) return false;
    seen.add(file);
    let source;
    try {
      source = read(file);
    } catch {
      return false;
    }
    if (AUTHORIZERS.some((a) => new RegExp(`\\b${a}\\s*\\(`).test(source))) return true;
    return importsOf(source, file)
      .map((spec) => resolveFn(spec, file))
      .filter(Boolean)
      .some((next) => moduleAuthorizes(next, seen));
  };

  for (const file of files) {
    const source = read(file);
    // Module-level 'use server' only. An inline one inside a component is a closure over a page
    // that has already run its own checks, and is a different shape with a different argument.
    if (!/^\s*['"]use server['"]/m.test(source.split('\n').slice(0, 3).join('\n'))) continue;

    const ast = parse(source, file);
    // Local functions this module defines, so an action delegating to one is followed.
    const local = new Map();
    walkAst(ast, (n) => {
      if (ts.isFunctionDeclaration(n) && n.name) local.set(n.name.getText(), n);
    });
    // Each imported NAME mapped to the module it came from, so "this action calls something that
    // authorizes" can be answered per call rather than per file.
    const nameToModule = new Map();
    walkAst(ast, (n) => {
      if (!ts.isImportDeclaration(n) || !n.importClause || !ts.isStringLiteral(n.moduleSpecifier))
        return;
      const target = resolveFn(n.moduleSpecifier.text, file);
      if (!target) return;
      const clause = n.importClause;
      if (clause.name) nameToModule.set(clause.name.text, target);
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) nameToModule.set(el.name.text, target);
      }
    });

    /** Does this function reach an authorizer — itself, via a local helper, or via an import? */
    const reaches = (node, seen = new Set()) => {
      const calls = callsWithin(node);
      if (AUTHORIZERS.some((a) => calls.has(a))) return true;
      for (const name of calls) {
        if (seen.has(name)) continue;
        seen.add(name);
        const fn = local.get(name);
        if (fn && reaches(fn, seen)) return true;
        const mod = nameToModule.get(name);
        if (mod && moduleAuthorizes(mod)) return true;
      }
      return false;
    };

    walkAst(ast, (node) => {
      const isExported = (n) =>
        ts.canHaveModifiers(n) &&
        ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (!ts.isFunctionDeclaration(node) || !node.name || !isExported(node)) return;
      const name = node.name.getText();
      if (exempt.has(name) || reaches(node)) return;
      problems.push(
        `${file}: Server Action \`${name}\` never reaches an authorization call. An exported ` +
          `action is a public POST endpoint whether or not any UI calls it, and a page-level check ` +
          `does not extend to it. Call ${AUTHORIZERS.join(' or ')}, or declare it in ` +
          `PUBLIC_ACTIONS with a reason.`,
      );
    });
  }
  return problems;
}

function main() {
  const files = walk(SRC);
  const read = (f) => readFileSync(f, 'utf8');
  const allowed = new Set(SERVICE_ROLE_ALLOWED.map((a) => a.file));
  const entries = files.filter((f) => isEntryPoint(f) && !allowed.has(f));

  const problems = [
    ...(existsSync(ADMIN)
      ? findAdminReachableFrom(entries, read, (s, f) => resolveImport(s, f))
      : []),
    ...findUnkeyedCaches(files, read),
    ...findDroppedCacheHeaders(files, read),
    ...findUnauthorizedActions(files, read, (s, f) => resolveImport(s, f)),
    ...findCycles(files, read, (s, f) => resolveImport(s, f)),
  ];

  if (!problems.length) {
    console.log(
      `boundaries: ok — ${entries.length} rendered entry point(s), none reaches the service-role client`,
    );
    return;
  }
  console.error('boundaries: FAILED\n');
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
