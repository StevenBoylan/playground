import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { LockIcon } from "@/components/shared/icons";

export const metadata: Metadata = {
  title: "Post-Application Architecture | Playground",
  description: "A quick explanation of Post-Application Architecture before you explore the demo.",
  robots: { index: false, follow: false },
};

const buttonStyle = { background: "linear-gradient(135deg, var(--accent), var(--accent-end))" };

/** The explainer that sits in front of the password-protected PAA demo. It is deliberately outside the gated /paa route. */
export default function PaaConceptPage() {
  return (
    <main className="relative">
      <div className="grid-fade pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-4xl px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
        <Link href="/" className="focus-ring text-sm font-medium text-muted hover:text-foreground">
          ← Playground
        </Link>
        <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
          Post-Application Architecture
        </p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">
          <span className="text-gradient">Software assembled</span> around the task.
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted">
          Describe what you want to achieve. AI interprets the request, services carry out the work within the limits your policies set, and the interface appears
          around the task.
        </p>

        <div className="card mt-10 overflow-hidden p-2 sm:p-3">
          <Image
            src="/paa-layers.gif"
            alt="Animation of the layers of Post-Application Architecture: a request, AI coordination, services and policies, and the interface assembled for the task."
            width={1280}
            height={1060}
            unoptimized
            priority
            className="mx-auto h-auto w-full max-w-3xl rounded-xl"
          />
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href="/paa"
            className="focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm"
            style={buttonStyle}
          >
            Explore the demo
            <span aria-hidden="true">→</span>
          </Link>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
            <LockIcon width={14} height={14} />
            Access required
          </span>
        </div>
      </div>
    </main>
  );
}
