import type { Metadata } from "next";
import { LifeApp } from "@/components/life/LifeApp";
import { SourcesPanel } from "@/components/life/SourcesPanel";
import { loadLifeData } from "@/lib/life/load";

export const metadata: Metadata = {
  title: "My life offers | Playground",
  description: "A personalised offers page built from signals across my own services, with the agents behind it shown.",
  robots: { index: false, follow: false },
};

const TRY = [
  "Browse the offers. Nobody searched for any of them.",
  "Tap “Why am I seeing this?” to follow one back to the signals behind it.",
  "Open “My data sources” and switch one off. Offers that rested on it change.",
  "Open “Behind the scenes” to see the flags, the intents and what was held back.",
];

export default function LifePage() {
  const lifeData = loadLifeData();
  return (
    <main className="relative">
      <div className="grid-fade pointer-events-none absolute inset-x-0 top-0 h-[320px]" aria-hidden="true" />
      <div className="relative mx-auto grid w-full max-w-5xl grid-cols-[minmax(0,1fr)] gap-10 px-4 pb-20 pt-8 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-x-16">
        <div className="lg:col-start-1 lg:row-start-1 lg:pt-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
            Latent Intent Marketing · Live example
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            <span className="text-gradient">{lifeData.title}</span>
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-muted">
            An AI-agent-assisted shopping experience. Agents read signals across my watch, calendar and music, then assemble offers for me before I search for anything. {lifeData.note}
          </p>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-widest text-accent">Try it</h2>
          <ol className="mt-3 max-w-xl list-decimal space-y-2 pl-5 text-muted marker:font-semibold marker:text-ink">
            {TRY.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </div>
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <LifeApp data={lifeData} />
        </div>
        <div className="lg:col-start-1 lg:row-start-2">
          <SourcesPanel data={lifeData} />
        </div>
      </div>
    </main>
  );
}
