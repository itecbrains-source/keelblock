import 'server-only';
import { validateEnv, isBuildPhase } from './env.schema';

/**
 * The loaded environment.
 *
 * **At BOOT, importing this module validates and throws** — so a misconfigured deployment fails
 * immediately with every problem listed, rather than at the first connection with one. That is the
 * property this module exists for and it is unchanged.
 *
 * **At BUILD, it does not**, and the difference is the whole point (F-88). `next build` evaluates
 * route modules to collect their configuration, so it is an importer too — and a build machine
 * legitimately holds no runtime secrets. Validating there turns a correct build into a failure that
 * names a route rather than a cause: CI reported "Failed to collect configuration for
 * /api/stripe/webhook" on one commit and "/api/cron/reconcile" on the next, because the route named
 * is simply whichever one the build reached first.
 *
 * The alternative — exporting the runtime variables into the build step — makes CI green without
 * addressing anything: it teaches the build to carry secrets it has no use for, and the next
 * variable a route needs breaks it again.
 *
 * So during a build the export is a PROXY that throws the moment anything actually reads a value.
 * A build that only imports this is fine; a build that tries to USE runtime configuration is a
 * defect, and gets a message saying so rather than a silent `undefined`.
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
        `\n\nSee .env.example. Every problem is listed above; fix them together.\n`,
    );
  }
  return result.env;
}

/**
 * Stands in for the environment while the build collects route configuration. Reading any value
 * from it is an error — deliberately loud, because the silent alternative is a build that bakes
 * `undefined` into something and surfaces it three layers away at runtime.
 */
function buildTimeStub(): ReturnType<typeof load> {
  return new Proxy({} as ReturnType<typeof load>, {
    get(_target, key) {
      throw new Error(
        `env.${String(key)} was read during \`next build\`. Values in this module are RUNTIME ` +
          `configuration and a build machine does not hold them. Read it inside a request handler, ` +
          `or from process.env directly if the value is genuinely needed at build time.`,
      );
    },
  });
}

export const env = isBuildPhase(process.env) ? buildTimeStub() : load();
