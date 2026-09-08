/**
 * Which OAuth providers this deployment has configured — SPEC-004 REQ-7.
 *
 * Empty by default, and that is the honest default: a provider button that always fails because no
 * client id exists is worse than no button. Set `NEXT_PUBLIC_OAUTH_PROVIDERS=github,google` once the
 * provider is configured in `supabase/config.toml` and its secrets are set.
 */
const SUPPORTED_OAUTH_PROVIDERS = ['github', 'google'] as const;
export type OAuthProvider = (typeof SUPPORTED_OAUTH_PROVIDERS)[number];

/** @param raw the comma-separated list, or undefined */
export function enabledOAuthProviders(raw: string | undefined): OAuthProvider[] {
  if (!raw) return [];
  const wanted = raw.split(',').map((s) => s.trim().toLowerCase());
  // Deny-by-default: an unrecognised name is dropped rather than passed through to Supabase, so a
  // typo produces no button instead of an opaque provider error.
  return SUPPORTED_OAUTH_PROVIDERS.filter((p) => wanted.includes(p));
}
