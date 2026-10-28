import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { GatesExplorer } from "@/components/gates/GatesExplorer";
import { INTRO, NOT_LINEAR, PRINCIPLE, PROBLEM, WHERE, YOUR_TURN } from "@/lib/gates/gates";

export const metadata: Metadata = {
  title: "The Four Gates | Playground",
  description: "What earns you the right to move from idea to product: a self-assessment guide for product teams.",
  robots: { index: false, follow: false },
};

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-2xl font-semibold tracking-tight sm:text-3xl">
      {children}
    </h2>
  );
}

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

          {/* Why this exists */}
          <section aria-labelledby="why" className="card mt-8 max-w-3xl p-5 sm:p-6">
            <blockquote className="border-l-4 border-accent pl-4 text-lg font-medium italic leading-snug">
              “{INTRO.hook.quote}”
              <footer className="mt-1 text-sm not-italic text-muted">— {INTRO.hook.by}</footer>
            </blockquote>
            <h2 id="why" className="mt-5 text-xl font-semibold tracking-tight">
              {INTRO.heading}
            </h2>
            {INTRO.paras.map((p) => (
              <p key={p.slice(0, 24)} className="mt-3 leading-relaxed">
                {p}
              </p>
            ))}
          </section>

          {/* The problem */}
          <section aria-labelledby="problem" className="mt-12">
            <SectionHeading id="problem">{PROBLEM.heading}</SectionHeading>
            <ul className="mt-5 grid gap-3 sm:grid-cols-3">
              {PROBLEM.pairs.map((p) => (
                <li key={p.said} className="card p-4 text-center">
                  <span className="block font-semibold">{p.said}</span>
                  <span aria-hidden="true" className="my-1 block text-accent">
                    ↓
                  </span>
                  <span className="block text-muted">{p.then}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-lg font-semibold text-accent">{PROBLEM.line}</p>
          </section>

          {/* The principle */}
          <section aria-label="The principle" className="card mt-10 max-w-3xl p-5 sm:p-6">
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
          </section>

          {/* So where are you? */}
          <section aria-labelledby="where" className="mt-12 grid gap-6 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionHeading id="where">{WHERE.heading}</SectionHeading>
              <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-muted">Don&apos;t ask</p>
              <p className="text-xl font-semibold leading-snug">“{WHERE.dont}”</p>
              <p className="mt-4 text-sm font-semibold uppercase tracking-widest text-accent">Ask</p>
              <p className="text-xl font-semibold leading-snug text-accent">“{WHERE.ask}”</p>
            </div>
            <ol className="card divide-y divide-line">
              {WHERE.prompts.map((p) => (
                <li key={p.n} className="flex items-center gap-4 px-5 py-3.5">
                  <span className="text-lg font-semibold text-accent">{p.n}</span>
                  <span className="font-semibold">{p.text}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="mt-10">
          <GatesExplorer />
        </div>

        <div className="print:hidden">
          {/* Progress is not linear */}
          <section aria-labelledby="linear" className="mt-14 grid items-center gap-8 lg:grid-cols-2">
            <div>
              <SectionHeading id="linear">{NOT_LINEAR.heading}</SectionHeading>
              <p className="mt-2 font-medium text-accent">{NOT_LINEAR.sub}</p>
              <p className="mt-6 text-3xl font-semibold leading-tight tracking-tight text-accent sm:text-4xl">{NOT_LINEAR.strong}</p>
              <p className="mt-1 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{NOT_LINEAR.then}</p>
              <p className="mt-4 text-muted">{NOT_LINEAR.snakes}</p>
            </div>
            <Image
              src="/4gates/board.webp"
              alt="A wooden snakes-and-ladders board whose four rows are the gates, Discovery at the bottom to Productisation at the top, with snakes labelled feature creep, vanity metrics, scope creep, free pilots, confirmation bias and founder heroics, and ladders labelled early advocates, first paying customer, CFO buy-in and renewals"
              width={900}
              height={900}
              className="mx-auto w-full max-w-md rounded-2xl border border-line shadow-[var(--shadow)]"
            />
          </section>

          {/* Your turn */}
          <section aria-labelledby="turn" className="mt-14">
            <SectionHeading id="turn">{YOUR_TURN.heading}</SectionHeading>
            <p className="mt-2 font-medium text-accent">{YOUR_TURN.sub}</p>
            <ol className="mt-5 grid gap-3 sm:grid-cols-2">
              {YOUR_TURN.steps.map((s) => (
                <li key={s.n} className="card flex gap-4 p-5">
                  <span className="text-2xl font-semibold text-accent">{s.n}</span>
                  <span>
                    <span className="block text-lg font-semibold">{s.title}</span>
                    <span className="mt-1 block text-muted">{s.text}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-center text-xl font-semibold text-accent">{YOUR_TURN.line}</p>
          </section>
        </div>
      </div>
    </main>
  );
}
