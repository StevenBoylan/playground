import Link from "next/link";
import { projects } from "@/lib/shared/projects";

export default function PlaygroundHome() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Playground</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        Open-source concept demos by Steven Boylan.
      </p>
      <ul className="mt-8 grid gap-4">
        {projects.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/${p.slug}`}
              className="block rounded-lg border border-neutral-300 p-5 hover:border-neutral-500 dark:border-neutral-700"
            >
              <h2 className="text-xl font-medium">{p.name}</h2>
              <p className="mt-1 font-medium">{p.tagline}</p>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{p.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
