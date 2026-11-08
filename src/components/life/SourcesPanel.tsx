import type { LifeData, Source } from "@/lib/life/types";

const STATUS = {
  connected: { label: "Connected", dot: "bg-good", note: "Read" },
  stale: { label: "Needs a refresh", dot: "bg-warn", note: "Last read" },
  missing: { label: "Not connected yet", dot: "bg-muted", note: "" },
  sample: { label: "Sample data", dot: "bg-muted", note: "" },
} as const;

function SourceRow({ source }: { source: Source }) {
  const state = STATUS[source.status ?? "sample"];
  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{source.name}</h3>
          <p className="text-sm text-muted">{source.role}</p>
        </div>
        <p className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-medium">
          <span className={`h-2 w-2 rounded-full ${state.dot}`} aria-hidden="true" />
          {state.label}
        </p>
      </div>
      {source.refreshed && state.note && (
        <p className="mt-1 text-xs text-muted">
          {state.note} {source.refreshed}
        </p>
      )}
      <dl className="mt-3 space-y-1 text-xs text-muted">
        <div>
          <dt className="inline font-semibold text-ink">Reads: </dt>
          <dd className="inline">{source.sees}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-ink">Never reads: </dt>
          <dd className="inline">{source.neverSees}</dd>
        </div>
      </dl>
    </li>
  );
}

/** The sources behind the offers, with what each one reads and how current it is. */
export function SourcesPanel({ data }: { data: LifeData }) {
  const sources = data.sources.filter((s) => s.id !== data.budgetSourceId);
  const live = sources.some((s) => s.status);
  return (
    <section aria-labelledby="sources-heading">
      <h2 id="sources-heading" className="text-sm font-semibold uppercase tracking-widest text-accent">
        Connected sources
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        {live
          ? "Each source is read by its own agent, and only the coarse signals it raises reach the offers."
          : "These are the sources the agents read. The offers here use illustrative signals, until my own accounts are connected."}
      </p>
      <ul className="mt-4 grid max-w-xl gap-3">
        {sources.map((s) => (
          <SourceRow key={s.id} source={s} />
        ))}
      </ul>
    </section>
  );
}
