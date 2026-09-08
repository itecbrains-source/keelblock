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
