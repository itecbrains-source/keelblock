import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

/**
 * ADR-004: with Cache Components enabled, any component reading cookies must sit inside a
 * <Suspense> boundary or the production build fails. So the shell is static and anything
 * session-dependent streams into it. This is the shape every authenticated page takes.
 */
async function Status() {
  const t = await getTranslations("home");
  // Placeholder for the session-dependent region. The auth and organisation surfaces land with
  // SPEC-004/005; this exists so the streaming boundary is real from the first commit rather than
  // retrofitted once it is inconvenient.
  return (
    <p className="rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
      {t("foundation")}
    </p>
  );
}

export default async function Home() {
  const t = await getTranslations("home");
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">{t("tagline")}</p>
      </div>
      <Suspense fallback={<p className="text-sm text-black/50">…</p>}>
        <Status />
      </Suspense>
    </main>
  );
}
