import 'server-only';
import { validateEnv } from './env.schema';

/**
 * The loaded environment. Importing this module validates and throws — so a misconfigured
 * deployment fails at boot with every problem listed, rather than at the first connection with one.
 *
 * `server-only` makes importing it from a client component a build error, because the parsed object
 * contains server credentials.
 */
function load() {
  const result = validateEnv(process.env as Record<string, string | undefined>);
  if (!result.ok) {
    throw new Error(
      `Environment is not valid — ${result.problems.length} problem(s):\n\n` +
        result.problems.map((p) => `  · ${p}`).join('\n') +
        `\n\nSee .env.example. Every problem is listed above; fix them together.\n`
    );
  }
  return result.env;
}

export const env = load();
