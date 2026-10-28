import type { Metadata } from "next";
import { GatesExplorer } from "@/components/gates/GatesExplorer";
import { PRINCIPLE } from "@/lib/gates/gates";

export const metadata: Metadata = {
  title: "The Four Gates | Playground",
  description: "What earns you the right to move from idea to product: a self-assessment guide for product teams.",
  robots: { index: false, follow: false },
};

export default function FourGatesPage() {
  return (
    <main className="relative">
      <div className="grid-fade pointer-events-none absolute inset-x-0 top-0 h-[420px] print:hidden" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
        <div className="print:hidden">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
            A self-assessment guide for product teams
          </p>
          <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
            <span className="text-gradient">The Four Gates</span>
          </h1>
          <p className="mt-4 max-w-2xl text-xl leading-relaxed text-muted">What earns you the right to move from idea to product.</p>

          <div className="card mt-8 max-w-3xl p-5 sm:p-6">
            <p className="leading-relaxed">{PRINCIPLE.intro}</p>
            <p className="mt-3 font-semibold">{PRINCIPLE.warning}</p>
            <p className="mt-5 text-center text-lg font-semibold tracking-tight text-accent">{PRINCIPLE.formula}</p>
            <ul className="mt-4 space-y-1 text-sm leading-relaxed text-muted">
              {PRINCIPLE.chain.map((c) => (
                <li key={c.stage}>
                  <span className="font-semibold text-ink">{c.stage}</span> → {c.evidence} → {c.invest}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8">
          <GatesExplorer />
        </div>
      </div>
    </main>
  );
}
