/**
 * Security headers and Content-Security-Policy. Pure — the middleware applies what this returns.
 *
 * Two deliberate departures from how the field usually ships this:
 *
 *   1. **On by default.** A header you must opt into is a header most projects never get. Turning
 *      them off is possible (`KEEL_SECURITY_HEADERS=off`) and deliberate.
 *   2. **No `'unsafe-eval'`, and `'unsafe-inline'` only where the framework genuinely requires it.**
 *      A CSP containing `'unsafe-eval'` has given away most of what a CSP is for.
 */

/**
 * MEASURED, and the reason the default is what it is:
 *
 *   A production Next build serves **13 inline `<script>` tags** (hydration bootstrap and streaming
 *   payloads). A `script-src 'self'` CSP blocks every one of them and the page never hydrates.
 *
 * There are exactly three ways out and **you can have any two of {strict CSP, static prerendering,
 * working hydration}**:
 *
 *   · `'unsafe-inline'` — works, prerenders, and gives away most of what a CSP is for. This is what
 *     the field ships while calling it a CSP.
 *   · a per-request **nonce** — genuinely strict, but the nonce must appear in the HTML, so the HTML
 *     must be generated per request. Static prerendering is gone. Verified: a nonce in the response
 *     header alone does not help, because the prerendered HTML was fixed at build time and carries
 *     no matching attribute.
 *   · **report-only** — nothing breaks, violations are visible, and enforcement is a decision the
 *     operator makes with data from their own app.
 *
 * keel defaults to `report-only` for the CSP and **enforces the other six headers unconditionally**.
 * That is the honest reading of "secure by default": enforce everything that can be enforced without
 * breaking the app, and report the one that cannot, rather than shipping `'unsafe-inline'` and
 * calling it protection.
 */
export type HeaderMode = 'on' | 'off' | 'report-only';

export const SECURITY_HEADERS = {
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  // Deny the powerful APIs outright. A starter that needs the camera can enable it knowingly.
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
} as const;

/**
 * `connectSrc` must include the Supabase URL: the browser client talks to it directly, so omitting
 * it breaks every authenticated request with a console error most people misread as a CORS problem.
 */
export function buildCsp({ nonce, supabaseUrl, isDev }: { nonce?: string; supabaseUrl: string; isDev: boolean }) {
  const scriptSrc = ["'self'"];
  if (nonce) scriptSrc.push(`'nonce-${nonce}'`, "'strict-dynamic'");
  // React refresh and the dev overlay evaluate injected code. Never in production.
  if (isDev) scriptSrc.push("'unsafe-eval'", "'unsafe-inline'");

  const policies: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': scriptSrc,
    // Tailwind and Next inject style tags; there is no nonce path for them that survives static
    // prerendering. Scoped to styles only, which cannot execute.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", supabaseUrl, ...(isDev ? ['ws:'] : [])],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'object-src': ["'none'"],
    'upgrade-insecure-requests': [],
  };

  return Object.entries(policies)
    .map(([k, v]) => (v.length ? `${k} ${v.join(' ')}` : k))
    .join('; ');
}

/** Which headers to actually set, given the mode. Pure, so the mode's meaning is testable. */
export function headersFor(mode: HeaderMode, csp: string): Record<string, string> {
  if (mode === 'off') return {};
  return {
    ...SECURITY_HEADERS,
    [mode === 'report-only' ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy']: csp,
  };
}
