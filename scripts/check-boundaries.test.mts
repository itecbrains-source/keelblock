import { describe, expect, it } from 'vitest';
import {
  importsOf,
  resolveImport,
  findAdminReachableFrom,
  findUnkeyedCaches,
  findCycles,
} from './check-boundaries.mjs';

const ADMIN = 'src/lib/supabase/server-only/admin.ts';
const resolver = (spec: string) =>
  spec.startsWith('@/') ? spec.replace('@/', 'src/') + '.ts' : null;

describe('boundaries gate', () => {
  it('extracts imports, ignoring comments and strings that merely mention one', () => {
    expect(
      importsOf(`import { a } from '@/x';\n// import { b } from '@/y';\nconst s = "from '@/z'";`),
    ).toEqual(['@/x']);
  });

  it('resolves an aliased import to a real file', () => {
    expect(
      resolveImport('@/lib/env', 'src/app/page.tsx', (p: string) => p === 'src/lib/env.ts'),
    ).toBe('src/lib/env.ts');
  });

  // ── mutation proofs ────────────────────────────────────────────────────────

  it('MUTATION: a page importing the service-role client directly is caught', () => {
    const files: Record<string, string> = {
      'src/app/page.tsx': `import { createAdminClient } from '@/lib/supabase/server-only/admin';`,
    };
    const p = findAdminReachableFrom(['src/app/page.tsx'], (f: string) => files[f] ?? '', resolver);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/bypasses RLS entirely/);
  });

  it('MUTATION: an INDIRECT path is caught — the reason this walks the graph', () => {
    // A rule you can defeat by moving the import one file away is not a boundary.
    const files: Record<string, string> = {
      'src/app/page.tsx': `import { all } from '@/lib/reports';`,
      'src/lib/reports.ts': `import { createAdminClient } from '@/lib/supabase/server-only/admin';`,
    };
    const p = findAdminReachableFrom(['src/app/page.tsx'], (f: string) => files[f] ?? '', resolver);
    expect(p[0]).toContain('src/lib/reports.ts');
    expect(p[0]).toContain(ADMIN); // the full chain, not just the endpoint
  });

  it('a page that never reaches the admin client passes', () => {
    const files: Record<string, string> = {
      'src/app/page.tsx': `import { createClient } from '@/lib/supabase/server';`,
    };
    expect(
      findAdminReachableFrom(['src/app/page.tsx'], (f: string) => files[f] ?? '', resolver),
    ).toEqual([]);
  });

  it('a cycle does not hang the walk', () => {
    const files: Record<string, string> = {
      'src/a.ts': `import '@/b';`,
      'src/b.ts': `import '@/a';`,
    };
    expect(findAdminReachableFrom(['src/a.ts'], (f: string) => files[f] ?? '', resolver)).toEqual(
      [],
    );
  });

  it('MUTATION: a cached function with no organisation parameter is caught', () => {
    // Next keys the cache on arguments. A tenant captured from scope is not in the key, so one
    // tenant's rows are served to the next — and RLS never runs, because the DB is never reached.
    const src = `export async function projects() {\n  'use cache';\n  return db.select();\n}`;
    const p = findUnkeyedCaches(['a.ts'], () => src);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/served to the next/);
  });

  it('a cached function that takes the organisation as an argument is allowed', () => {
    const src = `export async function projects(organizationId: string) {\n  'use cache';\n  return db.select();\n}`;
    expect(findUnkeyedCaches(['a.ts'], () => src)).toEqual([]);
  });

  it('MUTATION: an import cycle is caught, and the loop is shown', () => {
    // A cycle breaks tree-shaking and leaves module initialisation order undefined. It is invisible
    // until something mysteriously imports as `undefined`, which is a bad afternoon.
    const files: Record<string, string> = {
      'src/a.ts': `import '@/b';`,
      'src/b.ts': `import '@/a';`,
    };
    const c = findCycles(['src/a.ts'], (f: string) => files[f] ?? '', resolver);
    expect(c).toHaveLength(1);
    expect(c[0]).toContain('src/a.ts → src/b.ts → src/a.ts');
  });

  it('MUTATION: a longer cycle is caught too, not just the two-file case', () => {
    const files: Record<string, string> = {
      'src/a.ts': `import '@/b';`,
      'src/b.ts': `import '@/c';`,
      'src/c.ts': `import '@/a';`,
    };
    expect(findCycles(['src/a.ts'], (f: string) => files[f] ?? '', resolver)).toHaveLength(1);
  });

  it('the same cycle found from different entry points is reported once', () => {
    // Otherwise a cycle in a shared module is reported once per page that reaches it, and the
    // output becomes unreadable exactly when it matters.
    const files: Record<string, string> = {
      'src/a.ts': `import '@/b';`,
      'src/b.ts': `import '@/a';`,
    };
    expect(
      findCycles(['src/a.ts', 'src/b.ts'], (f: string) => files[f] ?? '', resolver),
    ).toHaveLength(1);
  });

  it('a diamond is not a cycle — two paths to one module are fine', () => {
    const files: Record<string, string> = {
      'src/a.ts': `import '@/b';\nimport '@/c';`,
      'src/b.ts': `import '@/d';`,
      'src/c.ts': `import '@/d';`,
      'src/d.ts': ``,
    };
    expect(findCycles(['src/a.ts'], (f: string) => files[f] ?? '', resolver)).toEqual([]);
  });

  it('the real source tree has no cycles', async () => {
    const { readdirSync, statSync, readFileSync } = await import('node:fs');
    const walk = (d: string, o: string[] = []): string[] => {
      for (const n of readdirSync(d)) {
        const p = `${d}/${n}`;
        if (statSync(p).isDirectory()) walk(p, o);
        else if (/\.tsx?$/.test(p)) o.push(p);
      }
      return o;
    };
    expect(
      findCycles(
        walk('src'),
        (f: string) => readFileSync(f, 'utf8'),
        (s: string, f: string) => resolveImport(s, f),
      ),
    ).toEqual([]);
  });

  it('a file with no use cache is not inspected', () => {
    expect(findUnkeyedCaches(['a.ts'], () => `export function x() { return 1; }`)).toEqual([]);
  });
});
