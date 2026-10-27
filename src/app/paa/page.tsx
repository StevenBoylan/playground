import Link from "next/link";

export default function PaaPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm underline">
        ← Playground
      </Link>
      <h1 className="mt-4 text-3xl font-semibold">Post-Application Architecture</h1>
      <p className="mt-2 font-medium">Software without the learning curve.</p>
      <p className="mt-4 text-neutral-600 dark:text-neutral-400">
        Work in progress. All companies and data in this demo are fictional.
      </p>
    </main>
  );
}
