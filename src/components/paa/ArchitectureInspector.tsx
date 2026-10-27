"use client";

import { BrainIcon, CogIcon, LayersIcon, ShieldIcon, SparklesIcon } from "@/components/shared/icons";
import type { Trace } from "@/lib/paa/schemas/trace";

const STATUS_STYLE: Record<string, string> = {
  ok: "bg-good/12 text-good",
  allowed: "bg-good/12 text-good",
  narrowed: "bg-warn/12 text-warn",
  denied: "bg-bad/12 text-bad",
  error: "bg-bad/12 text-bad",
};

function Pill({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_STYLE[status] ?? "bg-surface-2 text-muted"}`}>
      {status}
    </span>
  );
}

function Step({
  n,
  icon,
  title,
  note,
  last,
  children,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  note?: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="relative grid grid-cols-[2.25rem_1fr] gap-4">
      {!last && <span className="absolute bottom-0 left-[1.0625rem] top-9 w-px bg-line" aria-hidden="true" />}
      <span
        className="z-10 grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-accent shadow-sm"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="pb-7">
        <h4 className="flex items-baseline gap-2 text-sm font-semibold">
          <span className="text-xs font-medium text-muted">{n}</span>
          {title}
        </h4>
        {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
        <div className="mt-3 grid gap-2.5 text-sm">{children}</div>
      </div>
    </li>
  );
}

const CODE = "rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs";

/**
 * Shows what actually happened. Recorded events (policy checks, service calls, timings, validation) are kept
 * visibly apart from the model's own stated reasons, which are labelled as such.
 */
export function ArchitectureInspector({ trace }: { trace: Trace }) {
  const modelStated = trace.decisions.some((d) => d.source === "model_stated");
  return (
    <div className="card p-6">
      <ol>
        <Step n={1} icon={<BrainIcon width={18} height={18} />} title="Intent" note="How the request was interpreted.">
          <p>{trace.intent.text}</p>
          {trace.intent.assumptions.length > 0 && (
            <ul className="grid gap-1 text-muted">
              {trace.intent.assumptions.map((a) => (
                <li key={a}>Assumed: {a}</li>
              ))}
            </ul>
          )}
        </Step>

        <Step
          n={2}
          icon={<SparklesIcon width={18} height={18} />}
          title="Decisions"
          note={
            modelStated
              ? "The model's stated reasons for choosing each capability. These are explanations, not logged events."
              : "Authored reasons for this suggested request."
          }
        >
          {trace.decisions.length === 0 && <p className="text-muted">No capabilities were chosen.</p>}
          {trace.decisions.map((d, i) => (
            <p key={i}>
              <code className={CODE}>{d.capabilityId}</code> <span className="text-muted">{d.rationale}</span>
            </p>
          ))}
        </Step>

        <Step n={3} icon={<ShieldIcon width={18} height={18} />} title="Policies and execution" note="Recorded events from the backend.">
          {trace.executions.length === 0 && <p className="text-muted">No services were called.</p>}
          {trace.executions.map((e, i) => (
            <div key={i} className="rounded-xl border border-line bg-surface-2/40 p-4">
              <p className="flex flex-wrap items-center gap-2">
                <code className={CODE}>{e.capabilityId}</code>
                <Pill status={e.status} />
                <span className="text-xs text-muted">{e.durationMs} ms</span>
                {e.resultSummary && <span className="text-xs text-muted">{e.resultSummary}</span>}
              </p>
              <ul className="mt-3 grid gap-1.5">
                {e.policyChecks.map((c, j) => (
                  <li key={j} className="flex flex-wrap items-center gap-2">
                    <Pill status={c.status} />
                    <span className="text-muted">
                      {c.check}: {c.detail}
                    </span>
                  </li>
                ))}
              </ul>
              {e.error && <p className="mt-3 text-bad">{e.error}</p>}
              <p className="mt-3 break-words font-mono text-xs text-muted">params {JSON.stringify(e.params)}</p>
              {e.provenance && (
                <p className="font-mono text-xs text-muted">
                  dataset {e.provenance.datasetVersion} · result {e.provenance.resultId}
                </p>
              )}
            </div>
          ))}
        </Step>

        <Step n={4} icon={<LayersIcon width={18} height={18} />} title="Experience" note="The validated component tree and what each component is bound to.">
          {trace.validation && (
            <p>
              Validation: {trace.validation.repaired ? "the first layout was rejected and repaired once" : "passed on the first attempt"}.
              {trace.validation.repaired && trace.validation.firstErrors.length > 0 && (
                <span className="mt-1 block text-xs text-muted">Rejected for: {trace.validation.firstErrors.join("; ")}</span>
              )}
            </p>
          )}
          <ul className="grid gap-1.5">
            {trace.experience.tree.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-2 font-mono text-xs">
                <span className="rounded-md bg-accent/10 px-1.5 py-0.5 font-semibold text-accent">{n.type}</span>
                <span className="text-muted">{n.id}</span>
                {n.dataRef && <span className="text-muted">→ {n.dataRef}</span>}
              </li>
            ))}
          </ul>
        </Step>

        <Step n={5} icon={<CogIcon width={18} height={18} />} title="Architecture" note="What is generated for this request, and what persists." last>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-dashed border-accent/50 bg-accent/5 p-4">
              <p className="font-semibold">Ephemeral</p>
              <p className="mt-1 text-xs text-muted">The interpretation, the capability plan and this layout. Composed for this request, then gone.</p>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 p-4">
              <p className="font-semibold">Persistent substrate</p>
              <p className="mt-1 text-xs text-muted">Data, capability contracts, policies, validation rules and this audit trace.</p>
            </div>
          </div>
        </Step>
      </ol>
    </div>
  );
}
