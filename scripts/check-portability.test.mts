import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { stripComments } from './prose.mjs';

/**
 * ADR-012: the gates must stay framework-agnostic, or a future port loses the half of keelblock that
 * took longest to build. This is cheap to keep true and impossible to notice going wrong.
 */
const gates = readdirSync('scripts').filter((f) => f.endsWith('.mjs'));

describe('portability (ADR-012)', () => {
  it('every gate exists', () => expect(gates.length).toBeGreaterThanOrEqual(8));

  it('no gate imports a framework — they read files, the database, or package.json', () => {
    // Match an import STATEMENT at the start of a line, not any `from '…'` anywhere in the file.
    // The first version matched the string 'next/link' inside check-locale's own detection regex and
    // reported it as an import. That is the grep-versus-parse trap for the third time in this
    // project, made by the person who wrote a gate about it — hence a test rather than a habit.
    for (const g of gates) {
      const src = readFileSync(`scripts/${g}`, 'utf8');
      const imports = [...src.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
      for (const spec of imports) {
        expect(
          /^next|^react|^@next/.test(spec),
          `${g} imports ${spec} — the gate suite must survive a port`,
        ).toBe(false);
      }
    }
  });

  it('the portable half is substantial — otherwise the seam is a slogan', () => {
    // If a port has to rewrite the policies and the proof harness, it is a rebuild, not a port.
    const portable = [
      'supabase/migrations',
      'supabase/tests/intent',
      'scripts',
      'spec',
      'docs/adr',
      'messages',
    ];
    for (const dir of portable)
      expect(readdirSync(dir).length, `${dir} is empty`).toBeGreaterThan(0);
  });
});

/**
 * ADR-024: keelblock.dev deploys to Vercel, and this is what stops that from becoming lock-in.
 *
 * MakerKit markets "Real Deployment Options" as a comparison row aimed at Vercel-only kits, and
 * hosting keelblock.dev on Vercel hands that critique a data point. The answer is not to host
 * elsewhere — it is to **prove** portability instead of claiming it, so the sentence keelblock gets
 * to say is narrow and true:
 *
 *   keelblock targets Vercel in v1. It uses no Vercel-specific API, and a gate fails the build if
 *   one appears. A second target is not proven and we do not claim one.
 *
 * That is stronger than shipping a Dockerfile nobody tests, and it is honest in the way ADR-022 was
 * honest about AI: name the thing that is not proven rather than implying it is.
 *
 * **It passes on the day it lands**, which is the rule ADR-023 set when it deferred the consistency
 * gate: a gate that cannot pass when it arrives is a gate that gets exempted. Measured at deded68 —
 * zero `@vercel/*` packages, zero Vercel-only APIs.
 *
 * **Not a twelfth gate.** SPEC-003 makes the gate count a ceiling and asks a new one for "a promise
 * nothing else holds and a defect that actually happened". The promise is held here, by the file
 * ADR-012 already gave portability; the defect has not happened, and inventing a gate for it would
 * spend the ceiling on a rule that has never caught anything. It runs under `unit`.
 */
const APP_FILES: string[] = (function walk(dir, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (['.ts', '.tsx'].includes(extname(p))) out.push(p);
  }
  return out;
})('src');

/**
 * Comments stripped, on the day this rule is written rather than after it misfires.
 *
 * F-64 taught it, F-66 found it in five gates, F-67 hit it a third time in CSS — every one of them
 * a rule that reported on the documentation explaining it. The docblock above quotes `@vercel/*` to
 * say what is forbidden, and without this it would be the first thing this rule catches. The
 * conclusion from F-66 was that a text-matching rule needs the stripper the day it is written,
 * because whoever documents the rule breaks it first; this is that conclusion inherited rather than
 * re-derived.
 */
const appSource = () => APP_FILES.map((f) => [f, stripComments(readFileSync(f, 'utf8'))] as const);

describe('host portability (ADR-024) — Vercel is a target, not a dependency', () => {
  it('no application file imports a Vercel package', () => {
    // Import STATEMENTS only, for the reason the gate rule above already records: matching any
    // quoted string reports a package name written inside a detection regex as an import of it.
    for (const [file, src] of appSource()) {
      const imports = [...src.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
      for (const spec of imports) {
        expect(
          spec.startsWith('@vercel/'),
          `${file} imports ${spec} — keelblock targets Vercel but must not depend on it (ADR-024)`,
        ).toBe(false);
      }
    }
  });

  it('no application file reads a Vercel-only environment variable', () => {
    // `VERCEL`, `VERCEL_URL`, `VERCEL_ENV` and friends exist on exactly one host. Reading one is how
    // a codebase stops being portable without anybody deciding that it should.
    for (const [file, src] of appSource()) {
      const hits = [...src.matchAll(/process\.env\.(VERCEL[A-Z_]*)/g)].map((m) => m[1]);
      expect(hits, `${file} reads ${hits.join(', ')} — Vercel-only (ADR-024)`).toEqual([]);
    }
  });

  it('no Vercel package is installed', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(declared.filter((d) => d.startsWith('@vercel/'))).toEqual([]);
  });

  it('the `_vercel` path exclusion in the proxy matcher is NOT lock-in', () => {
    // Recorded because it is the one hit a grep for "vercel" returns, and the next person to run
    // that grep should find the answer here rather than re-deriving it. `_vercel` is a path prefix
    // excluded from the middleware matcher, the same way `_next` is. Excluding a path that only
    // ever exists on one host costs nothing anywhere else — it is not an API call, not an import,
    // and not a behaviour this app relies on.
    const proxy = stripComments(readFileSync('src/proxy.ts', 'utf8'));
    expect(proxy).toContain('_vercel');
    expect(proxy).not.toMatch(/@vercel\/|process\.env\.VERCEL/);
  });
});
