/**
 * The file that makes `src/lib/env.ts` true.
 *
 * That module's own docblock says importing it "validates and throws — so a misconfigured
 * deployment fails at boot with every problem listed, rather than at the first connection with
 * one." It was written correctly and **imported by nothing that runs**: its only importer is
 * `src/lib/supabase/server-only/admin.ts`, and the only things naming `createAdminClient` are
 * fixture STRINGS inside `scripts/check-boundaries.test.mts`. `export const env = load()` therefore
 * executed in no process, in development or in production, and the promise of a boot-time failure
 * was a comment (F-71).
 *
 * `register()` is the one hook Next.js calls once per server instance, before any request is
 * handled, which is the only place "at boot" can mean what the docblock says it means.
 *
 * **Guarded to the Node runtime deliberately.** `register()` is invoked in every runtime the app
 * boots, and the edge bundle that runs `proxy.ts` would validate a second time for no benefit —
 * a misconfiguration fails the Node boot first, and failing twice is not failing better. The guard
 * is the documented shape rather than a workaround for something that breaks.
 *
 * The import is dynamic because a static one would be hoisted into every runtime's bundle,
 * including the edge one this guard exists to keep it out of.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('@/lib/env');
  }
}
