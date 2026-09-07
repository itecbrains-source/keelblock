import { describe, expect, it } from 'vitest';
import { buildCsp, headersFor, SECURITY_HEADERS } from './security-headers';

const csp = (o: Partial<Parameters<typeof buildCsp>[0]> = {}) =>
  buildCsp({ supabaseUrl: 'https://x.supabase.co', isDev: false, ...o });

describe('security headers', () => {
  it('enforces the six non-CSP headers whenever headers are on at all', () => {
    for (const mode of ['on', 'report-only'] as const) {
      const h = headersFor(mode, csp());
      for (const key of Object.keys(SECURITY_HEADERS)) expect(h[key]).toBeDefined();
    }
  });

  it('report-only reports, and does NOT enforce', () => {
    const h = headersFor('report-only', csp());
    expect(h['Content-Security-Policy-Report-Only']).toBeDefined();
    expect(h['Content-Security-Policy']).toBeUndefined();
  });

  it('off means off — nothing is set, and nothing is half-set', () => {
    expect(headersFor('off', csp())).toEqual({});
  });

  // ── mutation proofs ────────────────────────────────────────────────────────

  it('MUTATION: production CSP never contains unsafe-eval', () => {
    // The single clearest sign of a CSP that has given up. A competing kit ships it.
    expect(csp()).not.toContain('unsafe-eval');
  });

  it('MUTATION: production script-src never contains unsafe-inline', () => {
    const scriptSrc = csp().split(';').find((d) => d.trim().startsWith('script-src'))!;
    expect(scriptSrc).not.toContain('unsafe-inline');
  });

  it('unsafe-eval is permitted ONLY in development, where the dev overlay requires it', () => {
    expect(csp({ isDev: true })).toContain("'unsafe-eval'");
    expect(csp({ isDev: false })).not.toContain("'unsafe-eval'");
  });

  it('MUTATION: connect-src includes Supabase — omitting it breaks every authenticated request', () => {
    // And it fails as a console error most people first misdiagnose as CORS.
    expect(csp()).toContain('https://x.supabase.co');
  });

  it('MUTATION: clickjacking is blocked two ways, since one is legacy', () => {
    expect(csp()).toContain("frame-ancestors 'none'");
    expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
  });

  it('MUTATION: the powerful browser APIs are denied, not merely unmentioned', () => {
    for (const api of ['camera', 'microphone', 'geolocation', 'payment'])
      expect(SECURITY_HEADERS['Permissions-Policy']).toContain(`${api}=()`);
  });

  it('a nonce switches script-src to strict-dynamic — the mode that costs prerendering', () => {
    const withNonce = csp({ nonce: 'abc123' });
    expect(withNonce).toContain("'nonce-abc123'");
    expect(withNonce).toContain("'strict-dynamic'");
  });

  it('base-uri and form-action are locked — the two directives everyone forgets', () => {
    expect(csp()).toContain("base-uri 'self'");
    expect(csp()).toContain("form-action 'self'");
  });
});
