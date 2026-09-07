import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.schema';

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54721',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_x',
};

describe('environment validation', () => {
  it('accepts a valid environment', () => {
    const r = validateEnv(valid);
    expect(r.ok).toBe(true);
  });

  it('defaults the CSP to report-only, because an enforcing one measurably breaks hydration', () => {
    // Not timidity: a production build serves 13 inline scripts, and `script-src 'self'` blocks all
    // of them. The other six headers are enforced regardless. See src/lib/security-headers.ts.
    const r = validateEnv(valid);
    expect(r.ok && r.env.KEEL_SECURITY_HEADERS).toBe('report-only');
  });

  // ── mutation proofs ────────────────────────────────────────────────────────

  it('MUTATION: a credential behind NEXT_PUBLIC_ is refused — it would ship to every visitor', () => {
    // The bundler inlines NEXT_PUBLIC_* into client JS. This is not a latent risk; it is published.
    const r = validateEnv({ ...valid, NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: 'leaked' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problems.join()).toMatch(/served to every visitor/);
  });

  it('MUTATION: every secret shape is caught, not just the one we thought of', () => {
    for (const name of ['NEXT_PUBLIC_STRIPE_SECRET', 'NEXT_PUBLIC_API_TOKEN', 'NEXT_PUBLIC_DB_PASSWORD',
                        'NEXT_PUBLIC_SENTRY_DSN', 'NEXT_PUBLIC_JWT_PRIVATE_KEY']) {
      expect(validateEnv({ ...valid, [name]: 'x' }).ok, `${name} was allowed through`).toBe(false);
    }
  });

  it('MUTATION: a missing required variable fails rather than becoming the string "undefined"', () => {
    const r = validateEnv({ NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problems.join()).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('MUTATION: "false" is not truthy here — the competing-kit bug this file exists to avoid', () => {
    // `enabled: process.env.FLAG ?? false` treats the string "false" as true. An enum cannot.
    expect(validateEnv({ ...valid, KEEL_SECURITY_HEADERS: 'false' }).ok).toBe(false);
    expect(validateEnv({ ...valid, KEEL_SECURITY_HEADERS: 'off' }).ok).toBe(true);
  });

  it('MUTATION: a malformed URL is caught at boot, not at first connection', () => {
    expect(validateEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' }).ok).toBe(false);
  });

  it('reports EVERY problem at once — fixing them one boot at a time is the worst loop there is', () => {
    const r = validateEnv({ NEXT_PUBLIC_SUPABASE_URL: 'nope', NEXT_PUBLIC_SERVICE_ROLE_KEY: 'leak' });
    expect(!r.ok && r.problems.length).toBeGreaterThanOrEqual(3);
  });
});
