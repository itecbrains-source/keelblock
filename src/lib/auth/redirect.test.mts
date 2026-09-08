import { describe, expect, it } from 'vitest';
import { DEFAULT_AFTER_SIGN_IN, safeNext } from './redirect';

/**
 * SPEC-004 REQ-7. The `next` parameter on the auth callback is attacker-supplied, and the callback
 * is a page the user reached by clicking a link in their email — which is what makes an open
 * redirect here worse than an ordinary one.
 *
 * Supabase's allowlist governs where the PROVIDER may return to. This governs where WE send the
 * browser afterwards. The two cover different halves and neither substitutes for the other.
 */
describe('safeNext', () => {
  it('accepts a same-origin relative path', () => {
    expect(safeNext('/dashboard')).toBe('/dashboard');
    expect(safeNext('/orgs/acme/settings?tab=billing')).toBe('/orgs/acme/settings?tab=billing');
  });

  it('falls back when absent or empty', () => {
    expect(safeNext(null)).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNext('')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNext(undefined)).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('refuses an absolute URL', () => {
    expect(safeNext('https://evil.example/steal')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNext('http://evil.example')).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('refuses a protocol-relative URL — the one people forget', () => {
    // Two leading slashes make a URL, not a path. A check for "starts with a slash" accepts it, and
    // the browser leaves the origin.
    expect(safeNext('//evil.example/steal')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNext('/\\evil.example')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNext('/\t/evil.example')).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('refuses a scheme-bearing value, including the sneaky ones', () => {
    expect(safeNext('javascript:alert(1)')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNext('data:text/html,<script>')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNext('JaVaScRiPt:alert(1)')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNext(' javascript:alert(1)')).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('refuses backslashes, which browsers normalise into a host separator', () => {
    expect(safeNext('\\\\evil.example')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNext('\\/evil.example')).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('refuses control characters and encoded separators', () => {
    expect(safeNext('/dash\nboard')).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeNext('/%2F%2Fevil.example')).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it('INVARIANT: whatever comes back cannot leave the origin it is resolved against', () => {
    // Stated as one property rather than a list of known payloads, because a list is always the set
    // someone thought of.
    const payloads = [
      '//evil.example',
      'https://evil.example',
      '\\\\evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      '/%2F%2Fevil.example',
      '/ok',
      null,
    ];
    for (const p of payloads) {
      expect(new URL(safeNext(p), 'https://app.example.com').origin).toBe(
        'https://app.example.com',
      );
    }
  });
});
