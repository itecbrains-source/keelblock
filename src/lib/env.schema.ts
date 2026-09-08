import { z } from 'zod';

/**
 * Environment SCHEMA and validation — pure, no side effects, no I/O.
 *
 * Split from `env.ts` deliberately: that module carries `import 'server-only'`, which makes it
 * unimportable from a test runner (correctly — it is the boundary doing its job). Pure logic lives
 * here so it can be tested; the loading side effect lives there.
 *
 * The failure this prevents is specific and common: an unvalidated `${process.env.X}` becomes the
 * literal string `"undefined"` and surfaces three layers away as a connection error to a host named
 * "undefined". A related trap, seen in a competing kit: `enabled: process.env.FLAG ?? false` means
 * setting `FLAG=false` **enables** the flag, because `??` only catches `undefined` and a non-empty
 * string is truthy.
 *
 * So: parse, do not read. Every problem is reported at once, at startup, by name.
 */

const url = z.string().url('must be a full URL including scheme');

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  KEEL_DB_URL: z.string().min(1).optional(),
  // Security headers ship ON. This exists to turn them OFF deliberately, and it is parsed as a
  // boolean rather than coerced from a string — `"false"` must mean false.
  // Default is report-only for the CSP; the other six headers are enforced regardless (unless
  // 'off'). See src/lib/security-headers.ts for the measurement behind that default.
  KEEL_SECURITY_HEADERS: z.enum(['on', 'off', 'report-only']).default('report-only'),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'required'),
});

/**
 * Anything matching this is a credential. A credential behind `NEXT_PUBLIC_` is **inlined into the
 * browser bundle by the bundler** — it is not a mistake that surfaces later, it is a published
 * secret. No competing kit checks for this, and it is one typo away at all times.
 */
const SECRET_SHAPED = /(SERVICE_ROLE|SECRET|PRIVATE_KEY|_TOKEN|PASSWORD|_DSN)/i;

/** Pure. Exported so every rule carries a mutation proof. */
export function validateEnv(raw: Record<string, string | undefined>) {
  const problems: string[] = [];

  const leaked = Object.keys(raw).filter(
    (k) => k.startsWith('NEXT_PUBLIC_') && SECRET_SHAPED.test(k),
  );
  for (const k of leaked) {
    problems.push(
      `${k} looks like a credential and is prefixed NEXT_PUBLIC_, so it will be inlined into the ` +
        `browser bundle and served to every visitor. Rename it without the prefix.`,
    );
  }

  const server = serverSchema.safeParse(raw);
  const client = clientSchema.safeParse(raw);
  for (const r of [server, client]) {
    if (!r.success) {
      for (const issue of r.error.issues)
        problems.push(`${issue.path.join('.')}: ${issue.message}`);
    }
  }

  if (problems.length) return { ok: false as const, problems };
  return { ok: true as const, env: { ...server.data!, ...client.data! } };
}
