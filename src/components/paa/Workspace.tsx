"use client";

import { useRef, useState } from "react";
import type { IntentEvent, IntentResult } from "@/lib/paa/orchestration/orchestrator";
import type { PlannedCall } from "@/lib/paa/orchestration/execute";
import type { Envelope } from "@/lib/paa/schemas/bindings";
import type { ExperienceSpec } from "@/lib/paa/schemas/experience";
import type { ExecutionRecord, Trace } from "@/lib/paa/schemas/trace";
import { ArchitectureInspector } from "./ArchitectureInspector";
import { DynamicRenderer } from "./DynamicRenderer";

export interface OrganizationSummary {
  id: string;
  name: string;
  domain: string;
  tagline: string;
  accent: string;
  available: boolean;
  roles: { id: string; label: string; description: string }[];
  prompts: { id: string; text: string }[];
}

interface View {
  experience: ExperienceSpec;
  envelope: Envelope;
  /** The plan as requested (before policy narrowing), so it can be re-run under another role or filter. */
  calls: PlannedCall[];
  trace: Trace;
}

interface Turn {
  request: string;
  calls: PlannedCall[];
}

type Note = { who: "you" | "paa"; text: string };

const FOLLOW_UPS = ["Show that as a table", "Break it down by month", "Compare it with the previous period", "Focus on the worst performer"];

const STAGE_LABEL = (e: IntentEvent): string => {
  switch (e.stage) {
    case "understanding":
      return "Understanding your request";
    case "fetching":
      return `Calling ${e.capabilities.map((c) => c.split(".").pop()).join(", ")}`;
    case "composing":
      return "Composing and checking the view";
    case "repairing":
      return "Fixing the layout against the data";
  }
};

/** Applies filter overrides to a plan; an empty value removes the input. */
function withFilters(calls: PlannedCall[], values: Record<string, string>): PlannedCall[] {
  return calls.map((c) => {
    const input = { ...c.input };
    for (const [k, v] of Object.entries(values)) {
      const [callKey, param] = k.split(".");
      if (callKey !== c.key) continue;
      if (v === "") delete input[param];
      else input[param] = v;
    }
    return { ...c, input };
  });
}

function initialFilters(experience: ExperienceSpec, calls: PlannedCall[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const c of experience.components) {
    if (c.type !== "FilterBar") continue;
    for (const f of c.filters) {
      const raw = calls.find((p) => p.key === f.callKey)?.input[f.param];
      values[`${f.callKey}.${f.param}`] = typeof raw === "string" ? raw : "";
    }
  }
  return values;
}

export function Workspace({ organizations }: { organizations: OrganizationSummary[] }) {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [roleId, setRoleId] = useState("");
  const [text, setText] = useState("");
  const [view, setView] = useState<View | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(true);
  const requestSeq = useRef(0);

  const org = organizations.find((o) => o.id === orgId);

  function choose(id: string | null) {
    const next = organizations.find((o) => o.id === id);
    // Switching organizations isolates everything: role, conversation, results and trace are all reset.
    requestSeq.current++;
    setOrgId(id);
    setRoleId(next?.roles[0]?.id ?? "");
    setText("");
    setView(null);
    setTurns([]);
    setNotes([]);
    setFilters({});
    setProgress([]);
    setError(null);
    setBusy(false);
    setShowTrace(false);
  }

  function adopt(next: View, request: string, answer: string) {
    setView(next);
    setFilters(initialFilters(next.experience, next.calls));
    setTurns((t) => [...t, { request, calls: next.calls }].slice(-3));
    setNotes((n) => [...n, { who: "you" as const, text: request }, { who: "paa" as const, text: answer }].slice(-8));
  }

  /** Suggested requests have a curated fallback so the demo still works without a configured model. */
  async function runCurated(promptId: string, request: string, role: string) {
    const res = await fetch("/api/paa/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: org?.id, roleId: role, promptId }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? "Request failed");
    adopt(body as View, request, `Built “${(body as View).experience.title}” from a suggested request.`);
  }

  async function ask(request: string, promptId?: string) {
    if (!org || !request.trim() || busy) return;
    const seq = ++requestSeq.current;
    setBusy(true);
    setError(null);
    setProgress([]);
    setText("");
    try {
      const res = await fetch("/api/paa/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: org.id,
          roleId,
          text: request,
          context: view ? { turns, experience: view.experience } : { turns },
        }),
      });

      if (res.status === 503) {
        setAiAvailable(false);
        if (promptId) {
          await runCurated(promptId, request, roleId);
          return;
        }
        throw new Error("Live AI isn't configured on this server. Pick one of the suggested requests instead.");
      }
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let result: IntentResult | undefined;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          const message = JSON.parse(line) as
            | ({ type: "event" } & IntentEvent)
            | { type: "result"; result: IntentResult }
            | { type: "error"; message: string };
          if (seq !== requestSeq.current) return;
          if (message.type === "event") setProgress((p) => [...p, STAGE_LABEL(message)]);
          else if (message.type === "result") result = message.result;
          else throw new Error(message.message);
        }
      }
      if (seq !== requestSeq.current || !result) return;

      if (result.kind === "experience") {
        adopt(result, request, `Built “${result.experience.title}”.`);
      } else if (result.kind === "message") {
        setNotes((n) => [...n, { who: "you" as const, text: request }, { who: "paa" as const, text: result.message }].slice(-8));
      } else {
        throw new Error(result.message);
      }
    } catch (e) {
      if (seq === requestSeq.current) setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      if (seq === requestSeq.current) {
        setBusy(false);
        setProgress([]);
      }
    }
  }

  /** Re-runs the current plan without the model: used for filter changes and role switches. */
  async function rerun(nextFilters: Record<string, string>, role: string) {
    if (!org || !view) return;
    const seq = ++requestSeq.current;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/paa/rerun", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: org.id, roleId: role, experience: view.experience, calls: withFilters(view.calls, nextFilters) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      if (seq !== requestSeq.current) return;
      const executions = body.executions as ExecutionRecord[];
      setView((v) => (v ? { ...v, experience: body.experience, envelope: body.envelope, trace: { ...v.trace, roleId: role, executions } } : v));
    } catch (e) {
      if (seq === requestSeq.current) setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      if (seq === requestSeq.current) setBusy(false);
    }
  }

  if (!org) {
    return (
      <section aria-labelledby="pick-org">
        <h2 id="pick-org" className="text-lg font-semibold">
          Choose a fictional company
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          {organizations.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                disabled={!o.available}
                onClick={() => choose(o.id)}
                className="h-full w-full rounded-lg border border-neutral-300 p-4 text-left enabled:hover:border-neutral-500 disabled:opacity-60 dark:border-neutral-700"
                style={{ borderTopColor: o.accent, borderTopWidth: 4 }}
              >
                <span className="block font-semibold">{o.name}</span>
                <span className="mt-1 block text-sm text-neutral-600 dark:text-neutral-400">{o.domain}</span>
                <span className="mt-2 block text-sm">{o.tagline}</span>
                {!o.available && <span className="mt-2 block text-xs font-medium">Coming soon</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const chips = view ? FOLLOW_UPS : org.prompts.map((p) => p.text);

  return (
    <div style={{ ["--accent" as string]: org.accent }}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-300 pb-4 dark:border-neutral-700">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "var(--accent)" }}>
            {org.name}
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Fictional company. All data is synthetic.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            View as
            <select
              value={roleId}
              disabled={busy}
              onChange={(e) => {
                setRoleId(e.target.value);
                void rerun(filters, e.target.value);
              }}
              className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
            >
              {org.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => choose(null)} className="text-sm underline">
            Switch company
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{org.roles.find((r) => r.id === roleId)?.description}</p>

      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(text);
        }}
      >
        <label htmlFor="intent" className="sr-only">
          What would you like to see?
        </label>
        <input
          id="intent"
          value={text}
          maxLength={500}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
          placeholder={view ? "Refine this view, or ask something new…" : "Ask a question about this company…"}
          className="min-w-0 flex-1 rounded-lg border border-neutral-400 bg-transparent px-3 py-2 dark:border-neutral-600"
        />
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="rounded-lg px-4 py-2 font-medium text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          Build
        </button>
      </form>

      <section className="mt-3" aria-label={view ? "Follow-up suggestions" : "Suggested requests"}>
        <ul className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <li key={c}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void ask(c, view ? undefined : org.prompts.find((p) => p.text === c)?.id)}
                className="rounded-full border border-neutral-300 px-3 py-1.5 text-left text-sm enabled:hover:border-neutral-500 disabled:opacity-60 dark:border-neutral-700"
              >
                {c}
              </button>
            </li>
          ))}
        </ul>
        {!aiAvailable && (
          <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
            Live AI isn&apos;t configured here, so only the suggested requests work.
          </p>
        )}
      </section>

      {notes.length > 0 && (
        <ol className="mt-5 grid gap-1 text-sm" aria-label="Conversation">
          {notes.map((n, i) => (
            <li key={i} className={n.who === "you" ? "font-medium" : "text-neutral-600 dark:text-neutral-400"}>
              {n.who === "you" ? "You: " : "PAA: "}
              {n.text}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-6" aria-live="polite" aria-busy={busy}>
        {busy && progress.length > 0 && (
          <ul className="mb-4 grid gap-1 text-sm">
            {progress.map((p, i) => (
              <li key={i}>
                {i < progress.length - 1 ? "✓" : "…"} {p}
              </li>
            ))}
          </ul>
        )}
        {busy && progress.length === 0 && <p className="mb-4 text-sm">Working…</p>}
        {error && (
          <p role="alert" className="mb-4 rounded border border-red-400 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </p>
        )}
        {!view && !busy && !error && notes.length === 0 && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Ask a question or pick a suggestion to build a view.</p>
        )}
        {view && (
          <div className={busy ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <DynamicRenderer
              experience={view.experience}
              envelope={view.envelope}
              filters={{
                values: filters,
                onChange: (callKey, param, value) => {
                  const next = { ...filters, [`${callKey}.${param}`]: value };
                  setFilters(next);
                  void rerun(next, roleId);
                },
              }}
            />
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setShowTrace((s) => !s)}
                aria-expanded={showTrace}
                className="text-sm font-medium underline"
              >
                {showTrace ? "Hide" : "Show"} how PAA built this
              </button>
              {showTrace && (
                <div className="mt-3">
                  <ArchitectureInspector trace={view.trace} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
