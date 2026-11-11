import type { Metadata } from "next";
import { LifeApp } from "@/components/life/LifeApp";
import { loadLifeData } from "@/lib/life/load";

export const metadata: Metadata = {
  title: "Your life offers | Playground",
  description: "A personalised offer built from signals across your own services, with the agents behind it shown.",
  robots: { index: false, follow: false },
};

const STEPS = [
  {
    title: "Your services notice small things",
    body: "Your running watch sees your distance creeping up. Your video app sees a marathon documentary. A search looks at flights to the coast. Your calendar shows a free weekend. Each one shares only a short headline, never the detail.",
  },
  {
    title: "Together, they point one way",
    body: "On its own, none of these says much. Put side by side over several weeks, they suggest something you have not said out loud: you may be ready to run a half marathon abroad.",
  },
  {
    title: "An offer is put together for you",
    body: "A shopping agent builds an offer around that goal: Cyprus, with the race entry, flights and hotel in one booking. You did not search for it.",
  },
  {
    title: "You stay in charge",
    body: "A finance agent checks the offer against the spending limit you set and holds back anything without enough evidence. You can switch any source off and watch the offers change.",
  },
];

export default function LifePage() {
  const lifeData = loadLifeData();
  return (
    <main className="relative">
      <div className="grid-fade pointer-events-none absolute inset-x-0 top-0 h-[320px]" aria-hidden="true" />
      <div className="relative mx-auto grid w-full max-w-5xl grid-cols-[minmax(0,1fr)] gap-10 px-4 pb-20 pt-8 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-16">
        <div className="lg:pt-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
            Latent Intent Marketing · Worked example
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            <span className="text-gradient">{lifeData.title}</span>
          </h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-muted">
            An AI-agent-assisted experience. Agents read signals across your watch, videos, searches and calendar, then assemble an offer for you before you search for anything.
          </p>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-widest text-accent">How it works</h2>
          <ol className="mt-3 max-w-xl space-y-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span aria-hidden="true" className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-white">
                  {i + 1}
                </span>
                <p className="leading-relaxed text-muted">
                  <span className="font-semibold text-ink">{step.title}.</span> {step.body}
                </p>
              </li>
            ))}
          </ol>
          <div className="mt-8 border-t border-line pt-6">
            <p className="max-w-xl text-sm leading-relaxed text-muted">Want to see what happens underneath, with the signals, the intents and the technical detail?</p>
            <a
              href="/lim"
              className="focus-ring mt-3 inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm"
              style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-end))" }}
            >
              Try the demo
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
        <LifeApp data={lifeData} />
      </div>
    </main>
  );
}
