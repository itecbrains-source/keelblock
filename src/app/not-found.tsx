import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="text-sm text-black/60 dark:text-white/60">
        This page does not exist, or you do not have access to it. Those are deliberately
        indistinguishable — telling them apart would confirm that a resource exists to someone not
        entitled to know.
      </p>
      <Link href="/" className="w-fit text-sm underline underline-offset-4">Back to start</Link>
    </main>
  );
}
