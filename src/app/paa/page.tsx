import Link from "next/link";
import { Workspace, type OrganizationSummary } from "@/components/paa/Workspace";
import { organizations } from "@/lib/paa/organizations";
import { curatedPrompts } from "@/lib/paa/orchestration/curated";

// Only what the browser needs: no permissions, no policy internals.
const summaries: OrganizationSummary[] = organizations.map((o) => ({
  id: o.id,
  name: o.name,
  domain: o.domain,
  tagline: o.tagline,
  accent: o.accent,
  available: o.available,
  roles: o.roles.map((r) => ({ id: r.id, label: r.label, description: r.description })),
  prompts: curatedPrompts.filter((p) => p.organizationId === o.id).map((p) => ({ id: p.id, text: p.text })),
}));

export default function PaaPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <Link href="/" className="text-sm underline">
        ← Playground
      </Link>
      <h1 className="mt-4 text-3xl font-semibold">Post-Application Architecture</h1>
      <p className="mt-1 font-medium">Software without the learning curve.</p>
      <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
        Agents decide. Services execute. Policies constrain. Every figure below is computed by a typed service from
        synthetic data; all companies and data are fictional.
      </p>
      <div className="mt-8">
        <Workspace organizations={summaries} />
      </div>
    </main>
  );
}
