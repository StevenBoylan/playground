"use client";

import { useRef, useState, type ReactNode } from "react";
import type { AboutInfo } from "@/lib/paa/about";
import type { Deliverable, DocKind } from "@/lib/paa/documents/types";
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
  LockIcon,
  OrbitIcon,
  SparklesIcon,
} from "@/components/shared/icons";
import { ArchitectureInspector } from "./ArchitectureInspector";
import { DeliverablePanel } from "./DeliverablePanel";
import { DynamicRenderer } from "./DynamicRenderer";
import { HelpPanel } from "./HelpPanel";
import { IntentBar } from "./IntentBar";
import { ProfileMenu } from "./ProfileMenu";

export interface OrganizationSummary {
  id: string;
  name: string;
  domain: string;
  tagline: string;
  accent: string;
  available: boolean;
  roles: { id: string; label: string; description: string }[];
  prompts: { id: string; text: string }[];
  ideas: string[];
  about: AboutInfo | null;
}

interface View {
  /** What is on screen now. After a policy block this is a blocked view, not the layout that was composed. */
  experience: ExperienceSpec;
  /** The layout as originally composed. Re-runs and exports always start from this, so switching profile back restores the full view. */
  base: ExperienceSpec;
  envelope: Envelope;
  /** The plan as requested (before policy narrowing), so it can be re-run under another role or filter. */
  calls: PlannedCall[];
  trace: Trace;
}

interface Turn {
  request: string;
  calls: PlannedCall[];
}

/** Once a view exists the ghost text hints at what a follow-up could be. */
const FOLLOW_UP_HINTS = ["Show that as a table", "Break it down by month", "Compare it with the previous period", "Make a PDF of this", "Email this to the leadership team"];

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

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

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
  const [lastRequest, setLastRequest] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
    // Switching organizations isolates everything: profile, results, trace and any document are all reset.
    requestSeq.current++;
    setOrgId(id);
    setRoleId(next?.roles[0]?.id ?? "");
    setText("");
    setView(null);
    setTurns([]);
    setLastRequest(null);
    setMessage(null);
    setFilters({});
    setProgress([]);
    setError(null);
    setBusy(false);
    setShowTrace(false);
    setDeliverable(null);
    setActing(null);
    setActionNote(null);
  }

  function adopt(next: Omit<View, "base"> & { base?: ExperienceSpec }, request: string) {
    setView({ ...next, base: next.base ?? next.experience });
    setFilters(initialFilters(next.experience, next.calls));
    setTurns((t) => [...t, { request, calls: next.calls }].slice(-3));
    setLastRequest(request);
    setMessage(null);
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
    adopt(body as View, request);
    setDeliverable(null);
    setActionNote(null);
  }

  async function ask(request: string) {
    if (!org || !request.trim() || busy) return;
    // Typing one of the example requests exactly still works without a model, through the curated path.
    const promptId = org.prompts.find((p) => normalize(p.text) === normalize(request))?.id;
    const seq = ++requestSeq.current;
    setBusy(true);
    setError(null);
    setMessage(null);
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
          context: view ? { turns, experience: view.base } : { turns },
        }),
      });

      if (res.status === 503) {
        setAiAvailable(false);
        if (promptId) {
          await runCurated(promptId, request, roleId);
          return;
        }
        throw new Error("Live AI isn't configured on this server. Press Tab to use an example request instead.");
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
          const event = JSON.parse(line) as
            | ({ type: "event" } & IntentEvent)
            | { type: "result"; result: IntentResult }
            | { type: "error"; message: string };
          if (seq !== requestSeq.current) return;
          if (event.type === "event") setProgress((p) => [...p, STAGE_LABEL(event)]);
          else if (event.type === "result") result = event.result;
          else throw new Error(event.message);
        }
      }
      if (seq !== requestSeq.current || !result) return;

      if (result.kind === "experience") {
        adopt(result, request);
        setDeliverable(result.deliverable ?? null);
        setActionNote(result.actionError ?? null);
      } else if (result.kind === "deliverable") {
        setLastRequest(request);
        setDeliverable(result.deliverable ?? null);
        setActionNote(result.actionError ?? null);
      } else if (result.kind === "message") {
        setLastRequest(request);
        setMessage(result.message);
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
        body: JSON.stringify({ organizationId: org.id, roleId, kind, experience: view.base, calls: withFilters(view.calls, filters) }),
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

  /** Re-runs the current plan without the model: used for filter changes and profile switches. */
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
        body: JSON.stringify({ organizationId: org.id, roleId: role, experience: view.base, calls: withFilters(view.calls, nextFilters) }),
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

  // --- Canvas -------------------------------------------------------------

  const empty = !view && !deliverable && !busy && !message && !actionNote;
  const suggestions = view ? FOLLOW_UP_HINTS : org.prompts.map((p) => p.text);

  return (
    <div style={{ ["--accent" as string]: org.accent }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => choose(null)}
          className="focus-ring group flex items-center gap-2.5 rounded-xl py-1 pr-3 text-left"
          aria-label={`${org.name}. Back to all companies`}
        >
          <span
            className="grid h-9 w-9 place-items-center rounded-xl text-white shadow-sm"
            style={{ background: `linear-gradient(135deg, ${org.accent}, color-mix(in srgb, ${org.accent} 45%, #0b1020))` }}
            aria-hidden="true"
          >
            <OrgIcon id={org.id} size={19} />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">{org.name}</span>
            <span className="block text-[11px] text-muted group-hover:text-ink">← All companies · fictional, synthetic data</span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          <ProfileMenu
            profiles={org.roles}
            currentId={roleId}
            disabled={busy}
            onSelect={(id) => {
              setRoleId(id);
              setMessage(null);
              void rerun(filters, id);
            }}
          />
          <HelpPanel
            about={org.about}
            roleId={roleId}
            hasView={view !== null}
            busy={busy}
            acting={acting}
            aiAvailable={aiAvailable}
            ideas={org.ideas}
            onAction={(kind) => void exportDoc(kind)}
            onAsk={(idea) => void ask(idea)}
          />
        </div>
      </div>

      {/* One control. Centred and large on an empty canvas, a slim bar above the answer afterwards. */}
      <div className={empty ? "mx-auto flex min-h-[52vh] max-w-3xl flex-col justify-center pb-10" : "sticky top-14 z-10 -mx-4 mt-4 bg-bg/80 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6"}>
        {empty && (
          <div className="mb-7 text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              <span className="text-gradient">{org.name}</span>
            </h2>
            <p className="mt-2 text-muted">{org.tagline}</p>
          </div>
        )}
        <IntentBar value={text} onChange={setText} onSubmit={() => void ask(text)} disabled={busy} suggestions={suggestions} compact={!empty} />
        {!empty && lastRequest && !busy && (
          <p className="mt-2 truncate px-1 text-xs text-muted">
            <span className="font-semibold uppercase tracking-wider">You asked</span> · {lastRequest}
          </p>
        )}
        {!aiAvailable && empty && <p className="mt-3 text-center text-xs text-muted">Live AI isn&apos;t configured here, so only the example requests work.</p>}
      </div>

      <div className="mt-2 grid gap-5" aria-live="polite" aria-busy={busy}>
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
            {error}
          </p>
        )}
        {message && (
          <div className="card rise flex items-start gap-3 p-5">
            <span className="mt-0.5 text-accent">
              <SparklesIcon width={18} height={18} />
            </span>
            <p className="text-sm leading-relaxed">{message}</p>
          </div>
        )}
        {busy && <ProgressCard steps={progress} />}
        {acting && !busy && (
          <ProgressCard steps={[acting === "pdf" ? "Generating the PDF" : acting === "pptx" ? "Building the slide deck" : "Drafting the email"]} />
        )}
        {actionNote && (
          <p role="alert" className="flex items-start gap-2.5 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            <span className="mt-0.5 shrink-0">
              <LockIcon width={18} height={18} />
            </span>
            {actionNote}
          </p>
        )}
        {deliverable && <DeliverablePanel deliverable={deliverable} onClose={() => setDeliverable(null)} />}

        {busy && !view && <Skeleton />}

        {view && (
          <div className={`grid gap-6 pb-10 transition-opacity ${busy ? "opacity-50" : ""}`}>
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
      </div>
    </div>
  );
}
