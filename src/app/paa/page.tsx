import { Intro } from "@/components/paa/Intro";
import { Workspace, type OrganizationSummary } from "@/components/paa/Workspace";
import { aboutFor } from "@/lib/paa/about";
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
  about: aboutFor(o.id),
}));

export default function PaaPage() {
  return (
    <main className="relative">
      <div className="grid-fade pointer-events-none absolute inset-x-0 top-0 h-[460px]" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
        <Workspace organizations={summaries} intro={<Intro />} />
      </div>
    </main>
  );
}
