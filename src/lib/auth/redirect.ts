/**
 * Where to send a browser after the auth callback — SPEC-004 REQ-7.
 *
 * The value arrives in a query parameter, so it is attacker-controlled, and the callback is reached
 * by clicking a link in an email. An open redirect there is a phishing primitive with the app's own
 * domain on the front of it.
 *
 * The rule is deny-by-default: **resolve it and check the origin**, rather than pattern-matching for
 * known-bad shapes. A blocklist of protocol-relative slashes, backslashes and `javascript:` is a
 * list of the payloads someone thought of; this asks the question the browser will ask.
 */

/** Where a signed-in user lands when no destination was requested. */
export const DEFAULT_AFTER_SIGN_IN = '/';

// Any origin works — the check is whether the input can move off whatever it is resolved against.
const PROBE_ORIGIN = 'https://keelblock.invalid';

/**
 * @param next the raw `next` parameter, or null/undefined when absent
 * @returns a path guaranteed to stay on the current origin
 */
export function safeNext(next: string | null | undefined): string {
  if (!next) return DEFAULT_AFTER_SIGN_IN;

  // Control characters and whitespace are stripped or ignored by browsers while parsing a URL, so a
  // leading space before `javascript:` and an embedded tab are both live payloads. Refuse rather
  // than sanitise: a value that needs cleaning to be safe is one we do not understand.
  if (/[\x00-\x20\x7f]/.test(next)) return DEFAULT_AFTER_SIGN_IN;

  // Every major browser normalises a backslash to a forward slash, so a leading pair of them is a
  // protocol-relative URL in disguise. URL parsing agrees for some cases and not others; refusing
  // the character outright is simpler than reasoning about which.
  if (next.includes('\\')) return DEFAULT_AFTER_SIGN_IN;

  let resolved: URL;
  try {
    resolved = new URL(next, PROBE_ORIGIN);
  } catch {
    return DEFAULT_AFTER_SIGN_IN;
  }
  if (resolved.origin !== PROBE_ORIGIN) return DEFAULT_AFTER_SIGN_IN;

  // Percent-encoded separators survive resolution as ordinary path characters and are decoded later
  // by something else — the classic double-decode. Nothing legitimate needs them here.
  if (/%2f|%5c/i.test(next)) return DEFAULT_AFTER_SIGN_IN;

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}
