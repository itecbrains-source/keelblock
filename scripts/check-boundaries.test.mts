import { describe, expect, it } from 'vitest';
import {
  SERVICE_ROLE_ALLOWED,
  findAdminReachableFrom,
  CACHE_HEADER_EXEMPT,
  PUBLIC_ACTIONS,
  findCycles,
  findDroppedCacheHeaders,
  findUnauthorizedActions,
  findUnkeyedCaches,
  importsOf,
  isEntryPoint,
  resolveImport,
  findPasswordSignIn,
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

  it('MUTATION: a cached function with no organization parameter is caught', () => {
    // Next keys the cache on arguments. A tenant captured from scope is not in the key, so one
    // tenant's rows are served to the next — and RLS never runs, because the DB is never reached.
    const src = `export async function projects() {\n  'use cache';\n  return db.select();\n}`;
    const p = findUnkeyedCaches(['a.ts'], () => src);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/served to the next/);
  });

  it('a cached function that takes the organization as an argument is allowed', () => {
    const src = `export async function projects(organizationId: string) {\n  'use cache';\n  return db.select();\n}`;
    expect(findUnkeyedCaches(['a.ts'], () => src)).toEqual([]);
  });

  it('MUTATION: an import cycle is caught, and the loop is shown', () => {
    // A cycle breaks tree-shaking and leaves module initialization order undefined. It is invisible
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

// ── R-8: the file type the outside world arrives through was not an entry point ────────────────

describe('entry points', () => {
  it('walks route handlers — the outside world arrives there', () => {
    // ADR-011: "Server Actions for the app, Route Handlers for the outside world." The boundary
    // walked pages and layouts and not `route.ts`, so the one file type designated to receive
    // unauthenticated external traffic was the one it did not follow.
    expect(isEntryPoint('src/app/api/webhooks/stripe/route.ts')).toBe(true);
    expect(isEntryPoint('src/app/api/health/route.tsx')).toBe(true);
  });

  it('walks a standalone actions.ts — a Server Action is a network boundary', () => {
    expect(isEntryPoint('src/app/[locale]/settings/actions.ts')).toBe(true);
  });

  it('still walks everything React renders', () => {
    for (const f of ['page', 'layout', 'template', 'default', 'error', 'loading', 'not-found']) {
      expect(isEntryPoint(`src/app/${f}.tsx`), `${f} is not treated as an entry point`).toBe(true);
    }
  });

  it('does not treat an ordinary module as an entry point', () => {
    expect(isEntryPoint('src/lib/db/queries.ts')).toBe(false);
    expect(isEntryPoint('src/components/route-badge.tsx')).toBe(false);
  });

  it('MUTATION: a route handler reaching the admin client is caught', () => {
    const files = {
      'src/app/api/x/route.ts': "import { admin } from '@/lib/supabase/server-only/admin';",
    };
    const problems = findAdminReachableFrom(
      Object.keys(files).filter(isEntryPoint),
      (f: string) => files[f as keyof typeof files],
      () => 'src/lib/supabase/server-only/admin.ts',
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('route.ts');
  });

  it('the service-role allowance list is empty, and every future entry carries a reason', () => {
    // The Stripe webhook (SPEC-007) is the canonical legitimate consumer and does not exist yet.
    // Granting the bypass should be a one-line diff in a reviewed list, not a comment in a file.
    for (const a of SERVICE_ROLE_ALLOWED) {
      expect(a.reason.length, `${a.file} is allowed with no reason`).toBeGreaterThan(24);
    }
    expect(SERVICE_ROLE_ALLOWED).toEqual([]);
  });
});

// ── R-9 / R-10: the rules were regexes, and each missed shapes that are ordinary here ───────────

describe('import graph (parsed, not matched)', () => {
  it('sees the four forms the regex missed', () => {
    const source = [
      "import a from './a';",
      "export * from './barrel';",
      "export { b } from './b';",
      "const c = await import('./c');",
      "const d = require('./d');",
    ].join('\n');
    expect(importsOf(source).sort()).toEqual(['./a', './b', './barrel', './c', './d']);
  });

  it('MUTATION: the admin client reached through a re-export barrel is caught', () => {
    // A `lib/queries/index.ts` barrel is the ordinary way a directory is organized, and the graph
    // failed OPEN on it: an unparsed import is a path not walked, reported as clean.
    const files: Record<string, string> = {
      'src/app/page.tsx': "import { load } from '@/lib/queries';",
      'src/lib/queries/index.ts': "export * from './projects';",
      'src/lib/queries/projects.ts': "import { admin } from '@/lib/supabase/server-only/admin';",
    };
    const problems = findAdminReachableFrom(
      ['src/app/page.tsx'],
      (f: string) => files[f] ?? '',
      (spec: string) =>
        spec === '@/lib/queries'
          ? 'src/lib/queries/index.ts'
          : spec === './projects'
            ? 'src/lib/queries/projects.ts'
            : spec === '@/lib/supabase/server-only/admin'
              ? 'src/lib/supabase/server-only/admin.ts'
              : null,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('index.ts');
  });

  it('does not invent imports from a string that merely looks like one', () => {
    expect(importsOf('const s = "import x from \'./nope\'";')).toEqual([]);
  });
});

describe('cache keys (every shape a function is written in)', () => {
  const cached = (body: string) => findUnkeyedCaches(['f.ts'], () => body);

  it('MUTATION: an ARROW function cached without the tenant is caught', () => {
    // The more common style in a Next codebase, and the one the regex could not see at all.
    const problems = cached("const getProjects = async () => { 'use cache'; return db(); };");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('getProjects');
  });

  it('MUTATION: a METHOD cached without the tenant is caught', () => {
    const problems = cached("const api = { async list() { 'use cache'; return db(); } };");
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('list');
  });

  it('MUTATION: a FILE-LEVEL directive caches every export, and unkeyed ones are caught', () => {
    // The widest version of the defect was the one the old rule could not see: the file passed the
    // pre-filter, yielded no function-declaration matches, and reported nothing.
    const problems = cached(
      ["'use cache';", 'export async function listProjects() { return db(); }'].join('\n'),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('listProjects');
  });

  it('a keyed function is not flagged, in any shape', () => {
    expect(
      cached("const get = async (orgId: string) => { 'use cache'; return db(orgId); };"),
    ).toEqual([]);
    expect(cached("async function get(organizationId: string) { 'use cache'; }")).toEqual([]);
    expect(
      cached(["'use cache';", 'export async function get(orgId: string) {}'].join('\n')),
    ).toEqual([]);
  });

  it("a file with no 'use cache' is not inspected at all", () => {
    expect(cached('export async function get() { return db(); }')).toEqual([]);
  });
});

describe('setAll cache headers (SPEC-004 REQ-4)', () => {
  const check = (src: string) => findDroppedCacheHeaders(['f.ts'], () => src, []);
  const client = (setAll: string) =>
    `createServerClient(url, key, { cookies: { getAll: () => store.getAll(), setAll: ${setAll} } });`;

  it('MUTATION: the real pre-fix signature — one parameter — fails', () => {
    // This is verbatim what src/lib/supabase/server.ts carried: the headers were not ignored,
    // they were never received. The library's words for the consequence: "one user's session
    // token can be served to a different user".
    const p = check(client('(list) => { list.forEach(c => store.set(c.name, c.value)); }'));
    expect(p[0]).toMatch(/takes 1 parameter/);
  });

  it('MUTATION: declared and never read fails — a correct signature is not the point', () => {
    const p = check(
      client('(list, headers) => { list.forEach(c => store.set(c.name, c.value)); }'),
    );
    expect(p[0]).toMatch(/declares `headers` and never reads it/);
  });

  it('taking both and using them passes', () => {
    expect(
      check(
        client('(list, headers) => { apply(list); for (const h of Object.keys(headers)) set(h); }'),
      ),
    ).toEqual([]);
  });

  it('a function expression is inspected too, not just an arrow', () => {
    expect(check(client('function (list) { apply(list); }'))[0]).toMatch(/takes 1 parameter/);
  });

  it('the exemption list is frozen by value, not capped by length', () => {
    // A length cap permits swapping any member for any other — how an allowlist loses a guarantee
    // without ever growing. F-30 paid for this lesson in the gate that certifies the other gates.
    expect(CACHE_HEADER_EXEMPT.map((e) => e.file)).toEqual(['src/lib/supabase/server.ts']);
    for (const e of CACHE_HEADER_EXEMPT) expect(e.reason.length).toBeGreaterThan(80);
  });

  it('exempting a file does not switch the rule off for the others', () => {
    const bad = 'createServerClient(u, k, { cookies: { setAll: (list) => apply(list) } });';
    const problems = findDroppedCacheHeaders(['exempt.ts', 'other.ts'], () => bad, [
      { file: 'exempt.ts', reason: 'x' },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^other\.ts/);
  });

  it('the real source tree is clean — and the rule actually looked at something', async () => {
    const { readdirSync, statSync, readFileSync } = await import('node:fs');
    const walk = (d: string, o: string[] = []): string[] => {
      for (const n of readdirSync(d)) {
        const p = `${d}/${n}`;
        if (statSync(p).isDirectory()) walk(p, o);
        else if (/\.tsx?$/.test(p)) o.push(p);
      }
      return o;
    };
    const files = walk('src');
    const read = (f: string) => readFileSync(f, 'utf8');
    expect(findDroppedCacheHeaders(files, read)).toEqual([]);
    // Non-vacuous, deliberately. "The real tree passes" is satisfied by a rule that inspects
    // nothing — which is exactly how checkStatusAgreement stayed green while finding no rows at
    // all. So assert there is something here for it to have looked at.
    expect(files.filter((f) => /setAll\s*:/.test(read(f))).length).toBeGreaterThan(0);
  });
});

describe('Server Action authorization (SPEC-004 REQ-3)', () => {
  const noResolve = () => null;
  const check = (src: string, publics = PUBLIC_ACTIONS) =>
    findUnauthorizedActions(['a.ts'], () => src, noResolve, publics);

  const action = (body: string) => `'use server';\n\nexport async function doThing() { ${body} }`;

  it('MUTATION: an exported action that never authorizes fails', () => {
    // F-15's shape: the row is reachable, and the check is somewhere the caller must remember.
    const p = check(action('await db.from("project").delete().eq("id", id);'), []);
    expect(p[0]).toMatch(/`doThing` never reaches an authorization call/);
  });

  it('an action calling the authorizer passes', () => {
    expect(check(action('await getCurrentUser(); await db.delete();'), [])).toEqual([]);
  });

  it('authorization is followed through the module graph, not just the action body', () => {
    // Delegating to a DAL function that authorizes is correct. Demanding the call be literally
    // inline would train people to satisfy the gate rather than the property.
    const files: Record<string, string> = {
      'a.ts': `'use server';\nimport { del } from './dal';\nexport async function doThing() { await del(); }`,
      'dal.ts': `import { getCurrentUser } from '@/lib/auth/dal';\nexport async function del() { await getCurrentUser(); }`,
    };
    const problems = findUnauthorizedActions(
      ['a.ts'],
      (f: string) => files[f] ?? '',
      (spec: string) => (spec === './dal' ? 'dal.ts' : null),
      [],
    );
    expect(problems).toEqual([]);
  });

  it('MUTATION: removing an action from the allowlist fails it — the list is the only opt-out', () => {
    const src = action('await sendLink();');
    expect(check(src, [{ action: 'doThing', reason: 'x' }])).toEqual([]);
    expect(check(src, [])).toHaveLength(1);
  });

  it('MUTATION: one authorizing action does not launder the others beside it', () => {
    // The defect the first version of this rule shipped with, caught by its own non-vacuity check:
    // the module-level answer made every action in a file look authorized as soon as one of them
    // authorized. `signOut` living next to `requestMagicLink` is exactly that shape.
    const src = [
      `'use server';`,
      `import { getCurrentUser } from '@/lib/auth/dal';`,
      `export async function signOut() { await getCurrentUser(); }`,
      `export async function deleteEverything() { await db.from('project').delete(); }`,
    ].join('\n');
    const problems = findUnauthorizedActions(
      ['a.ts'],
      () => src,
      () => null,
      [],
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/`deleteEverything`/);
  });

  it('a module without a top-level use server is not inspected', () => {
    expect(check('export async function doThing() { await db.delete(); }', [])).toEqual([]);
  });

  it('a non-exported function in an action module is not an entry point', () => {
    expect(check(`'use server';\nasync function helper() { await db.delete(); }`, [])).toEqual([]);
  });

  it('the public allowlist is frozen by value, and every entry carries a reason', () => {
    expect(PUBLIC_ACTIONS.map((a) => a.action)).toEqual(['requestMagicLink', 'startOAuth']);
    for (const a of PUBLIC_ACTIONS) expect(a.reason.length).toBeGreaterThan(80);
  });

  it('the real source tree is clean — and there are actions for it to have looked at', async () => {
    const { readdirSync, statSync, readFileSync } = await import('node:fs');
    const walk = (d: string, o: string[] = []): string[] => {
      for (const n of readdirSync(d)) {
        const p = `${d}/${n}`;
        if (statSync(p).isDirectory()) walk(p, o);
        else if (/\.tsx?$/.test(p)) o.push(p);
      }
      return o;
    };
    const files = walk('src');
    const read = (f: string) => readFileSync(f, 'utf8');
    expect(findUnauthorizedActions(files, read, (s, f) => resolveImport(s, f))).toEqual([]);
    // Non-vacuous: emptying the allowlist must produce findings, or the rule inspected nothing.
    expect(
      findUnauthorizedActions(files, read, (s, f) => resolveImport(s, f), []).length,
    ).toBeGreaterThan(0);
  });
});

describe('findPasswordSignIn — ADR-021, a decision that cannot erode quietly', () => {
  const read = (files: Record<string, string>) => (f: string) => files[f] ?? '';

  it('MUTATION: a call to signInWithPassword is caught, and the message says why', () => {
    // The real shape: somebody adds a password form beside the magic-link one. Nothing else in the
    // suite goes red for that — the policies are untouched and the page renders fine.
    const files = {
      'src/app/login/actions.ts':
        'const s = await createClient(); await s.auth.signInWithPassword({ email, password });',
    };
    const problems = findPasswordSignIn(Object.keys(files), read(files));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('ADR-021');
  });

  it('the word in a comment or a string is not a call — parsed, not searched', () => {
    // ADR-021, this file and the rule's own doc comment all contain the name. A text scan would
    // fail on the documents that explain the rule.
    const files = {
      'src/lib/notes.ts':
        "// ADR-021 forbids signInWithPassword.\nexport const why = 'signInWithPassword is refused';",
    };
    expect(findPasswordSignIn(Object.keys(files), read(files))).toEqual([]);
  });

  it('is not vacuous: the real source tree is clean, and that is the claim', () => {
    const files = { 'src/app/login/actions.ts': 'await s.auth.signInWithOtp({ email });' };
    expect(findPasswordSignIn(Object.keys(files), read(files))).toEqual([]);
  });
});
