"use client";

import { useRef, useState, type ReactNode } from "react";
import type { IntentEvent, IntentResult } from "@/lib/paa/orchestration/orchestrator";
import type { PlannedCall } from "@/lib/paa/orchestration/execute";
import type { Envelope } from "@/lib/paa/schemas/bindings";
import type { ExperienceSpec } from "@/lib/paa/schemas/experience";
import type { ExecutionRecord, Trace } from "@/lib/paa/schemas/trace";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronIcon,
  FactoryIcon,
  LayersIcon,
  LeafIcon,
  OrbitIcon,
  SendIcon,
  LockIcon,
  SparklesIcon,
} from "@/components/shared/icons";
import type { AboutInfo } from "@/lib/paa/about";
import type { Deliverable, DocKind } from "@/lib/paa/documents/types";
import { ArchitectureInspector } from "./ArchitectureInspector";
import { DeliverablePanel } from "./DeliverablePanel";
import { HelpPanel } from "./HelpPanel";
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
  about: AboutInfo | null;
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

const ORG_ICON: Record<string, (p: { width?: number; height?: number }) => ReactNode> = {
  northstar: FactoryIcon,
  orbit: OrbitIcon,
  grove: LeafIcon,
};

function OrgIcon({ id, size = 22 }: { id: string; size?: number }) {
  const Icon = ORG_ICON[id] ?? LayersIcon;
  return <Icon width={size} height={size} />;
}

const STAGE_LABEL = (e: IntentEvent): string => {
  switch (e.stage) {
    case "understanding":
      return "Understanding your request";
    case "fetching":
      return `Calling ${e.capabilities.map((c) => c.split(".").pop()?.replace(/_/g, " ")).join(", ")}`;
    case "composing":
      return "Composing and checking the view";
    case "repairing":
      return "Fixing the layout against the data";
    case "generating":
      return e.kind === "pdf" ? "Generating the PDF" : e.kind === "pptx" ? "Building the slide deck" : "Drafting the email";
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

/** Real progress, driven by backend events: completed steps tick, the current one pulses. */
function ProgressCard({ steps }: { steps: string[] }) {
  return (
    <div className="card rise p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Building your view</p>
      <ol className="grid gap-2.5">
        {steps.length === 0 && (
          <li className="flex items-center gap-3 text-sm">
            <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
            Working…
          </li>
        )}
        {steps.map((s, i) => {
          const done = i < steps.length - 1;
          return (
            <li key={i} className="flex items-center gap-3 text-sm">
              {done ? (
                <span className="grid h-5 w-5 place-items-center rounded-full bg-good/15 text-good" aria-hidden="true">
                  <CheckIcon width={13} height={13} strokeWidth={2.6} />
                </span>
              ) : (
                <span className="grid h-5 w-5 place-items-center" aria-hidden="true">
                  <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-accent" />
                </span>
              )}
              <span className={done ? "text-muted" : "font-medium"}>{s}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-5" aria-hidden="true">
      <div className="shimmer h-24 rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="shimmer h-28 rounded-2xl" />
        <div className="shimmer h-28 rounded-2xl" />
      </div>
      <div className="shimmer h-72 rounded-2xl" />
    </div>
  );
}

export function Workspace({ organizations, intro }: { organizations: OrganizationSummary[]; intro?: ReactNode }) {
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
  const [deliverable, setDeliverable] = useState<Deliverable | null>(null);
  const [acting, setActing] = useState<DocKind | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
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
    setDeliverable(null);
    setActing(null);
    setActionNote(null);
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
        setDeliverable(result.deliverable ?? null);
        setActionNote(result.actionError ?? null);
      } else if (result.kind === "deliverable") {
        const label = result.deliverable ? { pdf: "PDF", pptx: "slide deck", email: "email draft" }[result.deliverable.kind] : "document";
        setNotes((n) => [...n, { who: "you" as const, text: request }, { who: "paa" as const, text: result.actionError ? "I couldn't produce that document." : `Created your ${label}.` }].slice(-8));
        setDeliverable(result.deliverable ?? null);
        setActionNote(result.actionError ?? null);
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

  /** One-click documents (no model): the plan is re-run under the current role, then the action is authorized. */
  async function exportDoc(kind: DocKind) {
    if (!org || !view || busy || acting) return;
    setActing(kind);
    setError(null);
    setActionNote(null);
    try {
      const res = await fetch("/api/paa/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: org.id, roleId, kind, experience: view.experience, calls: withFilters(view.calls, filters) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      const made = (body.deliverable ?? null) as Deliverable | null;
      setDeliverable(made);
      setActionNote(body.actionError ?? null);
      const executions = body.executions as ExecutionRecord[];
      setView((v) =>
        v ? { ...v, trace: { ...v.trace, executions, deliverable: made ? { kind, title: made.document.title, blockCount: made.document.blocks.length } : undefined } } : v,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setActing(null);
    }
  }

  /** Re-runs the current plan without the model: used for filter changes and role switches. */
  async function rerun(nextFilters: Record<string, string>, role: string) {
    if (!org || !view) return;
    const seq = ++requestSeq.current;
    setBusy(true);
    setError(null);
    try {
      setDeliverable(null);
      setActionNote(null);
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

  // --- Company picker -----------------------------------------------------

  if (!org) {
    return (
      <div>
        {intro}
        <section aria-labelledby="pick-org" className="mt-12">
          <h2 id="pick-org" className="text-sm font-semibold uppercase tracking-wider text-muted">
            Choose a fictional company
          </h2>
          <ul className="mt-4 grid gap-5 sm:grid-cols-3">
            {organizations.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  disabled={!o.available}
                  onClick={() => choose(o.id)}
                  className="card card-lift focus-ring group relative flex h-full w-full flex-col overflow-hidden p-0 text-left disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
                  style={{ ["--accent" as string]: o.accent }}
                >
                  <span
                    className="relative block h-24 overflow-hidden"
                    style={{ background: `linear-gradient(135deg, ${o.accent}, color-mix(in srgb, ${o.accent} 45%, #0b1020))` }}
                    aria-hidden="true"
                  >
                    <span className="grid-fade absolute inset-0 opacity-50" style={{ filter: "invert(1)" }} />
                    <span className="absolute bottom-3 left-4 grid h-11 w-11 place-items-center rounded-xl bg-white/15 text-white backdrop-blur">
                      <OrgIcon id={o.id} />
                    </span>
                    {!o.available && (
                      <span className="absolute right-3 top-3 rounded-full bg-black/30 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                        Coming soon
                      </span>
                    )}
                  </span>
                  <span className="flex flex-1 flex-col p-5">
                    <span className="font-semibold tracking-tight">{o.name}</span>
                    <span className="mt-0.5 text-xs font-medium text-muted">{o.domain}</span>
                    <span className="mt-3 text-sm leading-relaxed text-muted">{o.tagline}</span>
                    {o.available && (
                      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-transform group-hover:translate-x-1">
                        Explore <ArrowRightIcon width={16} height={16} />
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  // --- Workspace ----------------------------------------------------------

  const role = org.roles.find((r) => r.id === roleId);
  const suggestions = view ? FOLLOW_UPS : [];

  return (
    <div style={{ ["--accent" as string]: org.accent }}>
      <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start">
        {/* Main column comes first on small screens so the composer is never buried. */}
        <section className="order-1 grid min-w-0 gap-5 lg:order-2" aria-label="Workspace">
          <div className="flex items-stretch gap-3">
          <form
            className="card flex min-w-0 flex-1 items-center gap-2 p-2 pl-4 shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_8%,transparent)] focus-within:border-accent"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(text);
            }}
          >
            <span className="text-accent" aria-hidden="true">
              <SparklesIcon width={20} height={20} />
            </span>
            <label htmlFor="intent" className="sr-only">
              What would you like to see?
            </label>
            <input
              id="intent"
              value={text}
              maxLength={500}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              placeholder={view ? "Refine, or ask something new…" : `Ask about ${org.name}…`}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={busy || !text.trim()}
              className="focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #7c3aed))" }}
            >
              Build
              <SendIcon width={16} height={16} />
            </button>
          </form>
          <HelpPanel
            about={org.about}
            roleId={roleId}
            hasView={view !== null}
            busy={busy}
            acting={acting}
            aiAvailable={aiAvailable}
            onAction={(kind) => void exportDoc(kind)}
            onAsk={(idea) => void ask(idea)}
          />
          </div>

          {!aiAvailable && (
            <p className="-mt-2 text-xs text-muted">Live AI isn&apos;t configured here, so only the suggested requests work.</p>
          )}
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
              {error}
            </p>
          )}

          <div aria-live="polite" aria-busy={busy}>
            {busy && <ProgressCard steps={progress} />}
            {acting && !busy && <ProgressCard steps={[acting === "pdf" ? "Generating the PDF" : acting === "pptx" ? "Building the slide deck" : "Drafting the email"]} />}
          </div>

          {actionNote && (
            <p role="alert" className="flex items-start gap-2.5 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
              <span className="mt-0.5 shrink-0">
                <LockIcon width={18} height={18} />
              </span>
              {actionNote}
            </p>
          )}
          {deliverable && <DeliverablePanel deliverable={deliverable} onClose={() => setDeliverable(null)} />}

          {/* Empty state: invite with example requests rather than a blank page. */}
          {!view && !busy && !deliverable && (
            <div className="card relative overflow-hidden p-6 sm:p-8">
              <div
                className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-30 blur-3xl"
                style={{ background: "var(--accent)" }}
                aria-hidden="true"
              />
              <span className="relative grid h-11 w-11 place-items-center rounded-2xl bg-accent/12 text-accent">
                <SparklesIcon width={22} height={22} />
              </span>
              <h3 className="relative mt-4 text-xl font-semibold tracking-tight">Ask anything about {org.name}</h3>
              <p className="relative mt-1.5 max-w-lg text-sm leading-relaxed text-muted">
                Describe what you want to know. PAA picks the right services, runs them under your role&apos;s permissions, and builds the
                view on the fly. Or start with a suggestion:
              </p>
              <ul className="relative mt-5 grid gap-3 sm:grid-cols-2">
                {org.prompts.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void ask(p.text, p.id)}
                      className="card-lift focus-ring group flex h-full w-full items-start justify-between gap-3 rounded-xl border border-line bg-surface p-4 text-left text-sm font-medium disabled:opacity-60"
                    >
                      <span>{p.text}</span>
                      <span className="mt-0.5 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent">
                        <ArrowRightIcon width={16} height={16} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {busy && !view && <Skeleton />}

          {view && (
            <div className={`grid gap-6 transition-opacity ${busy ? "opacity-50" : ""}`}>
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
              <div>
                <button
                  type="button"
                  onClick={() => setShowTrace((s) => !s)}
                  aria-expanded={showTrace}
                  className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium shadow-sm transition-colors hover:border-accent"
                >
                  <LayersIcon width={16} height={16} />
                  {showTrace ? "Hide" : "Show"} how PAA built this
                  <span className={`transition-transform ${showTrace ? "rotate-180" : ""}`}>
                    <ChevronIcon width={16} height={16} />
                  </span>
                </button>
                {showTrace && (
                  <div className="rise mt-4">
                    <ArchitectureInspector trace={view.trace} />
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <aside className="order-2 grid min-w-0 content-start gap-4 lg:sticky lg:top-20 lg:order-1">
          <div className="card overflow-hidden">
            <div
              className="relative flex items-center gap-3 p-4 text-white"
              style={{ background: `linear-gradient(135deg, ${org.accent}, color-mix(in srgb, ${org.accent} 45%, #0b1020))` }}
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 backdrop-blur">
                <OrgIcon id={org.id} />
              </span>
              <div className="min-w-0">
                <h2 className="truncate font-semibold tracking-tight">{org.name}</h2>
                <p className="text-xs text-white/80">Fictional · synthetic data</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => choose(null)}
              className="focus-ring w-full border-t border-line px-4 py-2.5 text-left text-xs font-medium text-muted transition-colors hover:text-ink"
            >
              ← Switch company
            </button>
          </div>

          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted" id="view-as">
              View as
            </p>
            <div role="radiogroup" aria-labelledby="view-as" className="mt-3 grid gap-1.5 rounded-xl bg-surface-2 p-1">
              {org.roles.map((r) => {
                const selected = r.id === roleId;
                return (
                  <button
                    key={r.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={busy}
                    onClick={() => {
                      if (selected) return;
                      setRoleId(r.id);
                      void rerun(filters, r.id);
                    }}
                    className={`focus-ring rounded-lg px-3 py-2 text-left text-sm font-medium transition-all disabled:opacity-60 ${
                      selected ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink"
                    }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">{role?.description}</p>
          </div>

          {suggestions.length > 0 && (
            <div className="card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Refine</p>
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Follow-up suggestions">
                {suggestions.map((c) => (
                  <li key={c}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void ask(c)}
                      className="focus-ring rounded-full border border-line bg-surface-2 px-3 py-1.5 text-left text-xs font-medium transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-60"
                    >
                      {c}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {notes.length > 0 && (
            <div className="card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Conversation</p>
              <ol className="mt-3 grid gap-2.5 text-sm" aria-label="Conversation">
                {notes.map((n, i) => (
                  <li key={i} className={n.who === "you" ? "font-medium" : "text-muted"}>
                    <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">{n.who === "you" ? "You" : "PAA"}</span>
                    {n.text}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
