import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * SPEC-004 REQ-6 — the auth configuration is stated, including the values that are already correct.
 *
 * This is F-31 applied to the auth surface. That finding's rule: *if a security property is true
 * because of a default you did not set, it is not a property, it is a version of somebody else's
 * image.* It was written after a Postgres image change silently removed `anon`'s privilege
 * boundary, while the fix that was WRITTEN DOWN survived the same change intact.
 *
 * So every assertion below is deliberate, and the uncomfortable ones are the values nobody is
 * proposing to change — `enable_refresh_token_rotation` is correct because Supabase chose well, not
 * because keelblock did. A test that pins a value it agrees with is the only kind that would have
 * caught F-31.
 */

/** Minimal reader for the keys this file cares about: `[section]` headers and `key = value`. */
function readAuthConfig(path = 'supabase/config.toml') {
  const out: Record<string, string> = {};
  let section = '';
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      section = header[1];
      continue;
    }
    const pair = /^([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (pair) out[`${section}.${pair[1]}`] = pair[2];
  }
  return out;
}

const config = readAuthConfig();

describe('auth configuration is stated, not inherited', () => {
  it('sessions expire — both bounds set, neither left to the default of never', () => {
    // Supabase leaves both unset, so a session lives until its refresh token is revoked. The
    // commented block in config.toml even shows these values; shipping with them commented out is
    // the difference between a property and a suggestion.
    expect(config['auth.sessions.timebox']).toBe('"24h"');
    expect(config['auth.sessions.inactivity_timeout']).toBe('"8h"');
  });

  it('refresh tokens rotate, and reuse is bounded — pinned BECAUSE it is already right', () => {
    // The most important assertion in this file. Nobody is proposing to change these; that is
    // exactly why they need pinning. See F-31.
    expect(config['auth.enable_refresh_token_rotation']).toBe('true');
    expect(config['auth.refresh_token_reuse_interval']).toBe('10');
  });

  it('a password, if one is ever used, is at least the length the file itself recommends', () => {
    // The generated comment reads "Minimum 6, recommended 8 or more" directly above the value 6.
    expect(Number(config['auth.minimum_password_length'])).toBeGreaterThanOrEqual(8);
  });

  it('anonymous sign-ins and manual linking stay off', () => {
    expect(config['auth.enable_anonymous_sign_ins']).toBe('false');
    expect(config['auth.enable_manual_linking']).toBe('false');
  });

  it('the emailed link expires within the window the vendor recommends', () => {
    // Supabase's production checklist: "We recommend setting this to 3600 seconds (1 hour) or
    // lower." Pinned so a later edit upward is a visible decision.
    expect(Number(config['auth.email.otp_expiry'])).toBeLessThanOrEqual(3600);
  });

  it('the JWT lifetime is the vendor default, and stated', () => {
    expect(config['auth.jwt_expiry']).toBe('3600');
  });

  it('the auth email rate limit is pinned, because it is a functional wall not a preference', () => {
    // Two per hour, project-wide, and Supabase is explicit that it can "only be changed with your
    // own custom SMTP setup". For a magic-link-first product that is the third sign-in of the hour
    // failing, so it is a number a deployment must meet deliberately.
    expect(config['auth.rate_limit.email_sent']).toBe('2');
  });

  it('sign-up and email sign-up remain open — a decision, not an oversight', () => {
    // A starter that shipped with signups closed would look broken; stated so that closing them
    // later is a change to this test rather than a silent flip.
    expect(config['auth.enable_signup']).toBe('true');
    expect(config['auth.email.enable_signup']).toBe('true');
  });
});

describe('identity comes from getClaims, never getSession (REQ-2)', () => {
  const walk = (d: string, o: string[] = []): string[] => {
    for (const n of readdirSync(d)) {
      const p = `${d}/${n}`;
      if (statSync(p).isDirectory()) walk(p, o);
      else if (/\.tsx?$/.test(p)) o.push(p);
    }
    return o;
  };

  it('no source file calls getSession at all', () => {
    // Supabase: "Never trust supabase.auth.getSession() inside server code… It isn't guaranteed to
    // revalidate the Auth token." It stays legitimate for reading the tokens themselves, so this is
    // a stronger rule than the spec requires — and it is the honest one WHILE no caller needs the
    // tokens. When one does, this test is the place that decision gets made, in a diff.
    // Comments and test files are stripped first. A rule that matches its own explanation of
    // itself is the text-matching defect this repository keeps paying for (F-20, F-30).
    const code = (f: string) =>
      readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    const offenders = walk('src')
      .filter((f) => !/\.test\.[a-z]+$/.test(f))
      .filter((f) => /\bgetSession\s*\(/.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it('the DAL verifies with getClaims — non-vacuous, so the rule above is not passing on absence', () => {
    expect(readFileSync('src/lib/auth/dal.ts', 'utf8')).toMatch(/getClaims\s*\(/);
  });
});

describe('redirect allowlist (REQ-7)', () => {
  it('carries no globstar — Supabase recommends exact paths in production', () => {
    const raw = readFileSync('supabase/config.toml', 'utf8');
    const line = raw.split('\n').find((l) => l.trim().startsWith('additional_redirect_urls'));
    expect(line).toBeDefined();
    expect(line).not.toContain('**');
  });
});
