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
 *           legitimate, and it is only safe if the organisation arrives as an ARGUMENT, which Next
 *           keys on. Captured from an outer scope or defaulted, it is one tenant's data served to
 *           the next.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';

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

/** @param {string} source @returns {string[]} */
export const importsOf = (source) =>
  [...source.matchAll(/(?:^|\n)\s*import\s[^'"]*['"]([^'"]+)['"]/g)].map((m) => m[1]);

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
        problems.push(`${path.join(' → ')}\n      a rendered page can reach the service-role client, which bypasses RLS entirely`);
        continue;
      }
      let source;
      try { source = read(file); } catch { continue; }
      for (const spec of importsOf(source)) {
        const target = resolveFn(spec, file);
        if (target) stack.push([target, [...path, target]]);
      }
    }
  }
  return problems;
}

/** A `use cache` function reaching tenant data must take its organisation as a parameter. */
/**
 * @param {string[]} files
 * @param {(f: string) => string} read
 * @returns {string[]}
 */
export function findUnkeyedCaches(files, read) {
  /** @type {string[]} */ const problems = [];
  for (const file of files) {
    const source = read(file);
    if (!/['"]use cache['"]/.test(source)) continue;
    const fns = [...source.matchAll(/(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)[^{]*\{([\s\S]{0,400}?)['"]use cache['"]/g)];
    for (const [, name, params] of fns) {
      if (!/organi[sz]ation|orgId|org_id|\borg\b/i.test(params)) {
        problems.push(
          `${file}: "${name}" is cached but takes no organisation parameter. ` +
          `Next keys the cache on arguments — a tenant captured from scope is not in the key, ` +
          `so one tenant's data is served to the next.`
        );
      }
    }
  }
  return problems;
}

function main() {
  const files = walk(SRC);
  const read = (f) => readFileSync(f, 'utf8');
  // Anything React renders. A Server Action colocated with a page is reachable from it too.
  const entries = files.filter((f) => /\/(page|layout|template|default|error|loading|not-found)\.tsx?$/.test(f));

  const problems = [
    ...(existsSync(ADMIN) ? findAdminReachableFrom(entries, read, (s, f) => resolveImport(s, f)) : []),
    ...findUnkeyedCaches(files, read),
  ];

  if (!problems.length) {
    console.log(`boundaries: ok — ${entries.length} rendered entry point(s), none reaches the service-role client`);
    return;
  }
  console.error('boundaries: FAILED\n');
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
