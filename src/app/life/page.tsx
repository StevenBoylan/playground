import type { Metadata } from "next";
import { LifeApp } from "@/components/life/LifeApp";
import { loadLifeData } from "@/lib/life/load";

export const metadata: Metadata = {
  title: "My life offers | Playground",
  description: "A personalised offers page built from signals across my own services, with the agents behind it shown.",
  robots: { index: false, follow: false },
};

export default function LifePage() {
  const lifeData = loadLifeData();
  return (
    <main className="relative">
      <div className="grid-fade pointer-events-none absolute inset-x-0 top-0 h-[320px]" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-2xl px-4 pb-20 pt-8 sm:pt-12">
        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          Latent Intent Marketing · Live example
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          <span className="text-gradient">{lifeData.title}</span>
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Offers assembled for me before I searched for anything, from signals across my watch, calendar and music. {lifeData.note}
        </p>
        <div className="mt-6">
          <LifeApp data={lifeData} />
        </div>
      </div>
    </main>
  );
}
