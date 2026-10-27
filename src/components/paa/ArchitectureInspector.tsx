"use client";

import type { Trace } from "@/lib/paa/schemas/trace";

const STATUS_STYLE: Record<string, string> = {
  ok: "text-green-700 dark:text-green-400",
  allowed: "text-green-700 dark:text-green-400",
  narrowed: "text-amber-700 dark:text-amber-400",
  denied: "text-red-700 dark:text-red-400",
  error: "text-red-700 dark:text-red-400",
};

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-300 p-4 dark:border-neutral-700">
      <h4 className="text-sm font-semibold">{title}</h4>
      {note && <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">{note}</p>}
      <div className="mt-3 grid gap-2 text-sm">{children}</div>
    </section>
  );
}

/**
 * Shows what actually happened. Recorded events (policy checks, service calls, timings, validation) are kept
 * visibly apart from the model's own stated reasons, which are labelled as such.
 */
export function ArchitectureInspector({ trace }: { trace: Trace }) {
  return (
    <div className="grid gap-4">
      <Section title="1. Intent" note="How the request was interpreted.">
        <p>{trace.intent.text}</p>
        {trace.intent.assumptions.length > 0 && (
          <ul className="list-disc pl-5">
            {trace.intent.assumptions.map((a) => (
              <li key={a}>Assumed: {a}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="2. Decisions"
        note={
          trace.decisions.some((d) => d.source === "model_stated")
            ? "The model's stated reasons for choosing each capability. These are explanations, not logged events."
            : "Authored reasons for this suggested request."
        }
      >
        {trace.decisions.length === 0 && <p>No capabilities were chosen.</p>}
        {trace.decisions.map((d, i) => (
          <p key={i}>
            <code className="font-mono text-xs">{d.capabilityId}</code> – {d.rationale}
          </p>
        ))}
      </Section>

      <Section title="3. Policies and execution" note="Recorded events from the backend.">
        {trace.executions.length === 0 && <p>No services were called.</p>}
        {trace.executions.map((e, i) => (
          <div key={i} className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
            <p className="flex flex-wrap items-center gap-2">
              <code className="font-mono text-xs">{e.capabilityId}</code>
              <span className={`font-medium ${STATUS_STYLE[e.status]}`}>{e.status}</span>
              <span className="text-xs text-neutral-600 dark:text-neutral-400">{e.durationMs} ms</span>
              {e.resultSummary && <span className="text-xs text-neutral-600 dark:text-neutral-400">{e.resultSummary}</span>}
            </p>
            <ul className="mt-2 grid gap-1">
              {e.policyChecks.map((c, j) => (
                <li key={j}>
                  <span className={`font-medium ${STATUS_STYLE[c.status]}`}>{c.status}</span> · {c.check}: {c.detail}
                </li>
              ))}
            </ul>
            {e.error && <p className="mt-2 text-red-700 dark:text-red-400">{e.error}</p>}
            <p className="mt-2 break-words font-mono text-xs text-neutral-600 dark:text-neutral-400">
              params {JSON.stringify(e.params)}
            </p>
            {e.provenance && (
              <p className="font-mono text-xs text-neutral-600 dark:text-neutral-400">
                dataset {e.provenance.datasetVersion} · result {e.provenance.resultId}
              </p>
            )}
          </div>
        ))}
      </Section>

      <Section title="4. Experience" note="The validated component tree and what each component is bound to.">
        {trace.validation && (
          <p>
            Validation: {trace.validation.repaired ? "the first layout was rejected and repaired once" : "passed on the first attempt"}.
            {trace.validation.repaired && trace.validation.firstErrors.length > 0 && (
              <span className="block text-xs text-neutral-600 dark:text-neutral-400">
                Rejected for: {trace.validation.firstErrors.join("; ")}
              </span>
            )}
          </p>
        )}
        <ul className="grid gap-1">
          {trace.experience.tree.map((n) => (
            <li key={n.id} className="font-mono text-xs">
              {n.type} <span className="text-neutral-600 dark:text-neutral-400">{n.id}</span>
              {n.dataRef && <span className="text-neutral-600 dark:text-neutral-400"> → {n.dataRef}</span>}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="5. Architecture" note="What is generated for this request, and what persists.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded border border-dashed border-neutral-400 p-3">
            <p className="font-medium">Ephemeral</p>
            <p className="text-xs">The interpretation, the capability plan and this layout. Composed for this request, then gone.</p>
          </div>
          <div className="rounded border border-neutral-400 bg-neutral-50 p-3 dark:bg-neutral-900">
            <p className="font-medium">Persistent substrate</p>
            <p className="text-xs">Data, capability contracts, policies, validation rules and this audit trace.</p>
          </div>
        </div>
      </Section>
    </div>
  );
}
