import { describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from './proxy';
import { CACHE_HEADERS_ON_REFRESH } from './response-client';

/**
 * SPEC-004 REQ-4. The contract under test is `@supabase/ssr`'s own, quoted from its type
 * definitions: cookies written after a token refresh arrive with headers that "must be set on the
 * HTTP response alongside the cookies", because otherwise "one user's session token can be served
 * to a different user".
 *
 * These are behavioural, not structural: they drive a real refresh through a fake Supabase client
 * and read the response that comes out. The structural half — a `setAll` that cannot receive the
 * headers at all — lives in the boundaries gate, because a rule about shape belongs where the other
 * shape rules are.
 */

type SetAll = (
  cookies: { name: string; value: string; options: Record<string, unknown> }[],
  headers: Record<string, string>,
) => void;

/** A stand-in for `createServerClient` that refreshes on `getClaims()`, as the real one does. */
function fakeSupabase({ refreshes = true } = {}) {
  let setAll: SetAll | undefined;
  return {
    factory: (_url: string, _key: string, opts: { cookies: { setAll: SetAll } }) => {
      setAll = opts.cookies.setAll;
      return {
        auth: {
          getClaims: vi.fn(async () => {
            if (refreshes) {
              setAll!(
                [{ name: 'sb-auth-token', value: 'fresh', options: { path: '/' } }],
                CACHE_HEADERS_ON_REFRESH,
              );
            }
            return { data: { claims: { sub: 'user-1' } }, error: null };
          }),
        },
      };
    },
    calls: () => setAll,
  };
}

const request = () => new NextRequest('https://app.example.com/dashboard');
const project = { url: 'https://x.supabase.co', key: 'anon-key' };

describe('proxy session refresh', () => {
  it('writes the refreshed cookie onto the response', async () => {
    const fake = fakeSupabase();
    const response = NextResponse.next();
    await updateSession(request(), response, { ...project, createClient: fake.factory });
    expect(response.cookies.get('sb-auth-token')?.value).toBe('fresh');
  });

  it('a response carrying a refreshed session is not cacheable', async () => {
    const fake = fakeSupabase();
    const response = NextResponse.next();
    await updateSession(request(), response, { ...project, createClient: fake.factory });

    // The exact failure this prevents: a CDN storing this response and serving the Set-Cookie to
    // the next visitor. Assert the directive, not the whole string, so the library may add to it.
    expect(response.headers.get('cache-control')).toMatch(/no-store/);
    expect(response.headers.get('cache-control')).toMatch(/private/);
  });

  it('does not touch cache headers when nothing refreshed', async () => {
    const fake = fakeSupabase({ refreshes: false });
    const response = NextResponse.next();
    await updateSession(request(), response, { ...project, createClient: fake.factory });
    expect(response.headers.get('cache-control')).toBeNull();
  });

  it('verifies with getClaims, and returns the claims it verified', async () => {
    const fake = fakeSupabase();
    const response = NextResponse.next();
    const result = await updateSession(request(), response, {
      ...project,
      createClient: fake.factory,
    });
    expect(result.claims).toEqual({ sub: 'user-1' });
  });

  it('constructs a client per call — reuse across requests loses the cache headers', async () => {
    // From the library's own note: "the cache headers are delivered only with the first cookie
    // write. A new server client must be created for each request."
    const seen: unknown[] = [];
    const factory = (u: string, k: string, o: { cookies: { setAll: SetAll } }) => {
      seen.push(o);
      return { auth: { getClaims: vi.fn(async () => ({ data: { claims: null }, error: null })) } };
    };
    await updateSession(request(), NextResponse.next(), { ...project, createClient: factory });
    await updateSession(request(), NextResponse.next(), { ...project, createClient: factory });
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
  });
});
