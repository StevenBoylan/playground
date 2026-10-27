import type { ReactNode } from "react";
import { CogIcon, ShieldIcon, SparklesIcon } from "@/components/shared/icons";

function Principle({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <li className="card flex items-start gap-3 p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs leading-relaxed text-muted">{text}</span>
      </span>
    </li>
  );
}

/** The introduction shown before a company is chosen. */
export function Intro() {
  return (
    <div className="relative">
      <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
        <SparklesIcon width={14} height={14} />
        Post-Application Architecture
      </p>
      <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
        <span className="text-gradient">Software without</span>
        <br />
        the learning curve.
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
        State what you need. An AI layer picks authorized capabilities, trusted services run them, and a purpose-built interface appears.
        Nothing here is a fixed dashboard.
      </p>
      <ul className="mt-9 grid gap-3 sm:grid-cols-3">
        <Principle icon={<SparklesIcon width={18} height={18} />} title="Agents decide" text="AI chooses the capabilities and the layout for your request." />
        <Principle icon={<CogIcon width={18} height={18} />} title="Services execute" text="Typed services compute every number from the data." />
        <Principle icon={<ShieldIcon width={18} height={18} />} title="Policies constrain" text="Your role limits what any request can see or do." />
      </ul>
    </div>
  );
}
