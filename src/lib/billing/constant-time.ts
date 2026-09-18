/**
 * Constant-time string comparison — SPEC-007 REQ-6's authorization.
 *
 * **In its own module, and not behind `server-only`, for a measured reason.** That package throws
 * when imported outside a React Server context — confirmed under vitest, and recorded in
 * `verify.ts` for the same situation. A secret comparison living inside the route would be a rule
 * about unauthenticated external traffic that no unit test could execute, so it lives here, where it
 * can be. It holds no credential of its own: both values are passed in.
 *
 * The defect this exists to prevent: `===` returns as soon as two bytes differ, so how long it takes
 * leaks how much of a guess was right, and a secret can be recovered a character at a time. Every
 * position is visited and the differences are accumulated, so the work does not depend on where the
 * first mismatch is.
 *
 * Length is compared first and separately, because two strings of different lengths cannot be equal
 * and the length is not the secret — the value is.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
