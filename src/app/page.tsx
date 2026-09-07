import { Suspense } from "react";

/**
 * ADR-004: with Cache Components enabled, any component reading cookies must sit inside a
 * <Suspense> boundary or the production build fails. So the shell is static and anything
 * session-dependent streams into it. This is the shape every authenticated page takes.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">keel</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          Multi-tenant SaaS starter — tenant isolation enforced by the database and proven on every commit.
        </p>
      </div>
      {children}
    </main>
  );
}

async function Status() {
  // Placeholder for the session-dependent region. The auth and organisation surfaces land with
  // SPEC-004/005; this exists so the streaming boundary is real from the first commit rather than
  // retrofitted once it is inconvenient.
  return (
    <p className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
      Foundation only. See <code>docs/ACCESS-MATRIX.md</code> for what the database currently permits.
    </p>
  );
}

export default function Home() {
  return (
    <Shell>
      <Suspense fallback={<p className="text-sm text-black/50">Loading…</p>}>
        <Status />
      </Suspense>
    </Shell>
  );
}
