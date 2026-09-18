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
  STRIPE_CLIENT_ALLOWED,
  findStripeReachableFrom,
  stripeValueImport,
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

  it('the service-role allowance list is frozen by value, and every entry carries a reason', () => {
    // Empty until SPEC-007 wired the webhook and the reconcile — the two consumers the list was
    // written for, named in it before either existed. Frozen BY VALUE rather than counted: a length
    // cap permits swapping one member for another, which is how an allowlist loses a guarantee
    // without ever growing (F-30). Both entries are Route Handlers with no user and no rendered
    // output; a `page.tsx` appearing here is a different thing wearing the same shape.
    expect(SERVICE_ROLE_ALLOWED.map((a) => a.file)).toEqual([
      'src/app/api/stripe/webhook/route.ts',
      'src/app/api/cron/reconcile/route.ts',
    ]);
    for (const a of SERVICE_ROLE_ALLOWED) {
      expect(a.reason.length, `${a.file} is allowed with no reason`).toBeGreaterThan(80);
    }
    expect(
      SERVICE_ROLE_ALLOWED.every((a) => /\/route\.ts$/.test(a.file)),
      'only a Route Handler can hold the service role — a page or an action may never',
    ).toBe(true);
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

  // ── every shape an exported action is written in — S-3 / F-78 ──────────────
  //
  // The rule matched `export async function` and nothing else. `export const x = async () => {}`
  // is the ORDINARY Next idiom, and it escaped completely: the gate matched the shape a careful
  // author uses and missed the shape a newcomer or an agent reaches for first, which is exactly
  // the population PRODUCT.md's differentiator is about.
  //
  // Latent rather than live when found: all ten actions in this repository use the matched form,
  // so nothing was unauthorized. The defect was that the gate could not stop the next one — and a
  // rule that cannot catch the common case is not a narrower rule, it is a different one.

  it('MUTATION: an unauthorized ARROW action is caught', () => {
    const src = `'use server';\nexport const wipe = async (id) => { await db.delete(id); };`;
    expect(check(src, []).length, '`export const x = async () => {}` is the ordinary idiom').toBe(
      1,
    );
  });

  it('MUTATION: an unauthorized FUNCTION EXPRESSION action is caught', () => {
    const src = `'use server';\nexport const wipe = async function (id) { await db.delete(id); };`;
    expect(check(src, []).length).toBe(1);
  });

  it('MUTATION: a DEFAULT-exported action is caught', () => {
    const src = `'use server';\nexport default async function wipe(id) { await db.delete(id); }`;
    expect(check(src, []).length).toBe(1);
  });

  it('MUTATION: an action exported through an export LIST is caught', () => {
    const src = `'use server';\nconst wipe = async (id) => { await db.delete(id); };\nexport { wipe };`;
    expect(check(src, []).length).toBe(1);
  });

  it('an arrow action that DOES authorize is not accused', () => {
    const src =
      `'use server';\nimport { getCurrentUser } from '@/lib/auth/dal';\n` +
      `export const ok = async () => { await getCurrentUser(); await db.read(); };`;
    expect(check(src, [])).toEqual([]);
  });

  it('an action delegating to a local ARROW helper that authorizes is not accused', () => {
    // The other half of the same root cause, and the more corrosive one: the helper map also
    // matched declarations only, so authorizing THROUGH an arrow read as not authorizing at all.
    // A false positive on correct code is how a gate gets exempted into uselessness (F-62).
    const src =
      `'use server';\nimport { getCurrentUser } from '@/lib/auth/dal';\n` +
      `const authorize = async () => { await getCurrentUser(); };\n` +
      `export async function safe(id) { await authorize(); await db.delete(id); }`;
    expect(check(src, [])).toEqual([]);
  });

  it("a re-export of another module's binding is not this module's action", () => {
    expect(check(`'use server';\nexport { something } from './other';`, [])).toEqual([]);
  });
});

// ── SPEC-007 REQ-2 / AC-2: the entitlement is never read from Stripe on the request path ────────
//
// The defect this stops is not exotic — it is the obvious way to build the feature. A paid surface
// asks "is this organization subscribed?", the answer is in Stripe, so the page asks Stripe. It
// works in development and it is wrong twice: every authorization decision now depends on a third
// party being reachable, and two readers of the same organization can disagree about whether it is
// inside its plan. ADR-006's split is that Stripe bills and the database entitles.

describe('the Stripe client is not reachable from a request path (SPEC-007 AC-2)', () => {
  const resolver = (spec: string) =>
    spec.startsWith('@/') ? spec.replace('@/', 'src/') + '.ts' : null;
  const read = (files: Record<string, string>) => (f: string) => files[f] ?? '';
  const walkFrom = (
    files: Record<string, string>,
    entries = Object.keys(files).filter(isEntryPoint),
  ) => findStripeReachableFrom(entries, read(files), resolver, []);

  it('MUTATION: a page importing the Stripe client directly is caught', () => {
    const files = { 'src/app/page.tsx': `import Stripe from 'stripe';` };
    const p = walkFrom(files);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/SPEC-007 REQ-2/);
    expect(p[0]).toMatch(/src\/app\/page\.tsx:1/); // the file and the line, not just the fact
  });

  it('MUTATION: an INDIRECT path is caught, and the whole chain is shown', () => {
    // The same reason the service-role walk is a graph walk: a boundary you defeat by moving the
    // import one file away is not a boundary. "A page can reach Stripe" is useless; the chain is
    // what someone can act on.
    const files = {
      'src/app/page.tsx': `import { plan } from '@/lib/plan';`,
      'src/lib/plan.ts': `import Stripe from 'stripe';`,
    };
    const p = walkFrom(files);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('src/app/page.tsx → src/lib/plan.ts');
  });

  it('MUTATION: reached through a re-export barrel, two hops deep', () => {
    const files = {
      'src/app/page.tsx': `import { load } from '@/lib/billing';`,
      'src/lib/billing.ts': `export * from '@/lib/billing-inner';`,
      'src/lib/billing-inner.ts': `import Stripe from 'stripe';`,
    };
    expect(walkFrom(files)).toHaveLength(1);
  });

  it('MUTATION: a Server Action reaching Stripe is caught — it is a network boundary too', () => {
    const files = { 'src/app/settings/actions.ts': `const s = await import('stripe');` };
    expect(walkFrom(files)).toHaveLength(1);
  });

  it('a page that reads the entitlement row instead passes — the shape ADR-006 asks for', () => {
    const files = {
      'src/app/page.tsx': `import { entitlement } from '@/lib/orgs/dal';`,
      'src/lib/orgs/dal.ts': `export const entitlement = () => db.from('organization_entitlement');`,
    };
    expect(walkFrom(files)).toEqual([]);
  });

  it('an allowed entry point is not walked, and exempting it does not switch the rule off', () => {
    // The failure mode of every allowlist: one grant quietly becomes a general one.
    const files = {
      'src/app/api/stripe/webhook/route.ts': `import Stripe from 'stripe';`,
      'src/app/page.tsx': `import Stripe from 'stripe';`,
    };
    const p = findStripeReachableFrom(
      Object.keys(files).filter(isEntryPoint),
      read(files),
      resolver,
      [{ file: 'src/app/api/stripe/webhook/route.ts', reason: 'x' }],
    );
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('src/app/page.tsx');
  });

  it('a cycle does not hang the walk', () => {
    const files = { 'src/app/page.tsx': `import '@/a';`, 'src/a.ts': `import '@/app/page';` };
    expect(walkFrom(files, ['src/app/page.tsx'])).toEqual([]);
  });

  it('the allowance list is frozen by value, and its entry carries a reason', () => {
    // Counted lists permit a swap; F-30 paid for this in the gate that certifies the other gates.
    expect(STRIPE_CLIENT_ALLOWED.map((a) => a.file)).toEqual([
      'src/app/api/stripe/webhook/route.ts',
      'src/app/api/cron/reconcile/route.ts',
    ]);
    for (const a of STRIPE_CLIENT_ALLOWED) expect(a.reason.length).toBeGreaterThan(80);
    // The question REQ-2 actually asks, kept in front of whoever adds a third: does this entry
    // point decide whether somebody may do something? Both of these serve no page and gate no
    // action — they are Route Handlers with no user present.
    expect(
      STRIPE_CLIENT_ALLOWED.every((a) => /\/route\.ts$/.test(a.file)),
      'a page or a Server Action may never reach the Stripe client — that is the request path',
    ).toBe(true);
  });

  it('the real tree is clean — and the rule had a real chain to look at', async () => {
    const { readdirSync, statSync, readFileSync } = await import('node:fs');
    const walk = (d: string, o: string[] = []): string[] => {
      for (const n of readdirSync(d)) {
        const p = `${d}/${n}`;
        if (statSync(p).isDirectory()) walk(p, o);
        else if (/\.tsx?$/.test(p)) o.push(p);
      }
      return o;
    };
    const entries = walk('src').filter(isEntryPoint);
    const readFile = (f: string) => readFileSync(f, 'utf8');
    const resolve = (s: string, f: string) => resolveImport(s, f);
    expect(findStripeReachableFrom(entries, readFile, resolve)).toEqual([]);
    // Non-vacuous, and this is the assertion that matters: emptying the allowance must produce a
    // finding. "The real tree passes" is satisfied by a rule that inspects nothing — which is
    // exactly how a green gate here once proved nothing at all (F-13).
    expect(
      findStripeReachableFrom(entries, readFile, resolve, []).length,
      'no entry point reaches the Stripe SDK today, so this rule cannot be shown to fire',
    ).toBeGreaterThan(0);
  });
});

describe('stripeValueImport — a type import is not a client', () => {
  const at = (src: string) => stripeValueImport(src, 'f.ts');

  it('catches every form that survives to runtime', () => {
    expect(at(`import Stripe from 'stripe';`)?.specifier).toBe('stripe');
    expect(at(`import { Stripe } from 'stripe';`)?.specifier).toBe('stripe');
    expect(at(`import * as S from 'stripe';`)?.specifier).toBe('stripe');
    expect(at(`import 'stripe';`)?.specifier).toBe('stripe'); // side-effect: still executes
    expect(at(`export * from 'stripe';`)?.specifier).toBe('stripe');
    expect(at(`export { Stripe } from 'stripe';`)?.specifier).toBe('stripe');
    expect(at(`const s = await import('stripe');`)?.specifier).toBe('stripe');
    expect(at(`const s = require('stripe');`)?.specifier).toBe('stripe');
    expect(at(`import { Webhooks } from 'stripe/lib/Webhooks';`)?.specifier).toBe(
      'stripe/lib/Webhooks',
    );
  });

  it('ignores a type-only import — it is erased before anything runs', () => {
    // Accusing this is a false positive on correct code, and a gate that reports correct code is a
    // gate somebody exempts (F-62). `Stripe.Event` as a TYPE is how the next payload gets modelled.
    expect(at(`import type Stripe from 'stripe';`)).toBeNull();
    expect(at(`import type { Event } from 'stripe';`)).toBeNull();
    expect(at(`import { type Event } from 'stripe';`)).toBeNull();
    expect(at(`export type { Event } from 'stripe';`)).toBeNull();
  });

  it('MUTATION: a MIXED clause is a value import — one binding survives', () => {
    expect(at(`import Stripe, { type Event } from 'stripe';`)?.specifier).toBe('stripe');
    expect(at(`import { type Event, Webhooks } from 'stripe';`)?.specifier).toBe('stripe');
  });

  it('does not fire on the browser SDK, or on a name that merely starts with it', () => {
    // @stripe/stripe-js carries the publishable key, decides no authorization and reads nobody's
    // entitlement. Widening to it would report correct code the day someone builds Checkout.
    expect(at(`import { loadStripe } from '@stripe/stripe-js';`)).toBeNull();
    expect(at(`import x from 'stripe-fake';`)).toBeNull();
  });

  it('the word in a comment or a string is not an import — parsed, not searched', () => {
    // This rule's own doc comment, ADR-006 and SPEC-007 all contain the word. A text scan would
    // fail on the documents that explain the rule — four separate rules here have done exactly
    // that (F-64, F-66, F-67, F-70).
    expect(
      at(`// import Stripe from 'stripe';\nconst s = "import Stripe from 'stripe'";`),
    ).toBeNull();
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
