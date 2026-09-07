/**
 * Route-level loading state.
 *
 * ADR-004 makes streaming architectural rather than decorative: with Cache Components, a component
 * that reads cookies must stream, so *loading* is a state the framework requires you to design. This
 * is the route-level default; a page with a meaningful skeleton should provide its own.
 */
export default function Loading() {
  return (
    <main
      className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6 py-16"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading</span>
      <div className="h-6 w-40 animate-pulse rounded bg-black/10 dark:bg-white/10" />
      <div className="h-4 w-full animate-pulse rounded bg-black/5 dark:bg-white/5" />
      <div className="h-4 w-4/5 animate-pulse rounded bg-black/5 dark:bg-white/5" />
    </main>
  );
}
