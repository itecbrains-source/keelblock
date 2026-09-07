'use client';

/**
 * Honest states (PRODUCT.md): a failure says it failed. It never renders as an empty list or a zero,
 * which is the most expensive UI bug there is, because it looks like an answer.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        This page could not load. It has not shown you partial or stale data — it stopped instead.
      </p>
      {error.digest && (
        <p className="text-xs text-black/40 dark:text-white/40">
          Reference <code>{error.digest}</code> — quote this if you report it.
        </p>
      )}
      <button
        onClick={reset}
        className="w-fit rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
      >
        Try again
      </button>
    </main>
  );
}
