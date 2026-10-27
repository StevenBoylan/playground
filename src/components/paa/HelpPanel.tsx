"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowRightIcon, CheckIcon, CloseIcon, FileIcon, MailIcon, QuestionIcon, SlidesIcon, SparklesIcon } from "@/components/shared/icons";
import type { AboutInfo } from "@/lib/paa/about";
import type { DocKind } from "@/lib/paa/documents/types";

interface HelpPanelProps {
  about: AboutInfo | null;
  roleId: string;
  hasView: boolean;
  busy: boolean;
  acting: DocKind | null;
  aiAvailable: boolean;
  ideas: string[];
  onAction: (kind: DocKind) => void;
  onAsk: (text: string) => void;
}

const ACTIONS: { kind: DocKind; label: string; detail: string; icon: ReactNode }[] = [
  { kind: "pdf", label: "Create a PDF report", detail: "Branded, with charts and tables. Downloads as a file.", icon: <FileIcon width={18} height={18} /> },
  { kind: "pptx", label: "Create a slide deck", detail: "Branded PowerPoint with editable charts.", icon: <SlidesIcon width={18} height={18} /> },
  { kind: "email", label: "Draft an email", detail: "Shown in a simulated window. Nothing is sent.", icon: <MailIcon width={18} height={18} /> },
];

const VIEW_IDEAS = ["Email this to the leadership team", "Make a PDF of this", "Turn this into a short slide deck"];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h3>
      {children}
    </section>
  );
}

function AboutTab({ about, roleId }: { about: AboutInfo; roleId: string }) {
  return (
    <div className="grid gap-6">
      <Section title="The company">
        <p className="text-sm leading-relaxed">{about.overview}</p>
        <dl className="grid gap-1.5 text-sm">
          {about.facts.map((f) => (
            <div key={f.label} className="grid grid-cols-[7.5rem_1fr] gap-2">
              <dt className="text-muted">{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="The data">
        <p className="text-sm leading-relaxed">{about.data.range}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-muted">Available as</span>
          {about.data.granularities.map((g) => (
            <span key={g} className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
              {g}
            </span>
          ))}
        </p>
        <ul className="grid gap-1.5 text-sm">
          {about.data.datasets.map((d) => (
            <li key={d.name}>
              <span className="font-medium">{d.name}.</span> <span className="text-muted">{d.detail}.</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="What it can do">
        <ul className="grid gap-2 text-sm">
          {about.skills.map((s) => (
            <li key={s.name} className="flex gap-2">
              <span className="mt-0.5 shrink-0 text-accent">
                <SparklesIcon width={15} height={15} />
              </span>
              <span>
                <span className="font-medium">{s.name}.</span> <span className="text-muted">{s.detail}.</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Roles and permissions">
        <p className="text-xs leading-relaxed text-muted">
          Use <span className="font-medium text-ink">View as</span> to switch roles. The backend enforces these on every request, so asking for something a role
          may not do is blocked, however it is phrased.
        </p>
        <div className="grid gap-3">
          {about.roles.map((r) => {
            const current = r.id === roleId;
            return (
              <div key={r.id} className={`rounded-xl border p-3.5 ${current ? "border-accent bg-accent/5" : "border-line bg-surface-2/40"}`}>
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {r.label}
                  {current && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">You are here</span>}
                </p>
                <p className="mt-0.5 text-xs text-muted">Data scope: {r.scope}</p>
                <ul className="mt-2.5 grid gap-1 text-sm">
                  {r.can.map((c) => (
                    <li key={c} className="flex items-center gap-2">
                      <span className="text-good" aria-label="Allowed">
                        <CheckIcon width={15} height={15} strokeWidth={2.4} />
                      </span>
                      {c}
                    </li>
                  ))}
                  {r.cannot.map((c) => (
                    <li key={c} className="flex items-center gap-2 text-muted">
                      <span className="text-bad" aria-label="Not allowed">
                        <CloseIcon width={15} height={15} strokeWidth={2.4} />
                      </span>
                      {c}
                    </li>
                  ))}
                </ul>
                {r.notes.length > 0 && (
                  <ul className="mt-3 grid gap-1 border-t border-line pt-2.5 text-xs leading-relaxed text-muted">
                    {r.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

/** A small popover, kept out of the way: the demo is about asking, so the help is there when it is wanted. */
export function HelpPanel({ about, roleId, hasView, busy, acting, aiAvailable, ideas, onAction, onAsk }: HelpPanelProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"further" | "about">("further");
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const ask = (text: string) => {
    setOpen(false);
    onAsk(text);
  };
  const act = (kind: DocKind) => {
    setOpen(false);
    onAction(kind);
  };

  const tabs = [
    { id: "further" as const, label: "Take it further" },
    ...(about ? [{ id: "about" as const, label: "About" }] : []),
  ];

  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="focus-ring card flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium transition-colors hover:border-accent"
      >
        <QuestionIcon width={18} height={18} />
        Help
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Help"
          className="card rise absolute right-0 top-full z-30 mt-2 w-[min(30rem,calc(100vw-2rem))] overflow-hidden shadow-[var(--shadow-lift)]"
        >
          <div role="tablist" aria-label="Help sections" className="flex border-b border-line bg-surface-2/60 px-2 pt-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`${panelId}-${t.id}-tab`}
                aria-selected={tab === t.id}
                aria-controls={`${panelId}-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`focus-ring -mb-px rounded-t-lg border border-b-0 px-4 py-2 text-sm font-medium transition-colors ${
                  tab === t.id ? "border-line bg-surface text-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close help" className="focus-ring ml-auto mb-1 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
              <CloseIcon width={16} height={16} />
            </button>
          </div>

          <div className="max-h-[min(34rem,70vh)] overflow-y-auto p-5">
            {tab === "further" && (
              <div role="tabpanel" id={`${panelId}-further`} aria-labelledby={`${panelId}-further-tab`} className="grid gap-6">
                <Section title="Use this view">
                  {hasView ? (
                    <ul className="grid gap-2">
                      {ACTIONS.map((a) => (
                        <li key={a.kind}>
                          <button
                            type="button"
                            disabled={busy || acting !== null}
                            onClick={() => act(a.kind)}
                            className="focus-ring group flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left transition-colors enabled:hover:border-accent disabled:opacity-60"
                          >
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">{a.icon}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold">{a.label}</span>
                              <span className="block text-xs text-muted">{a.detail}</span>
                            </span>
                            <ArrowRightIcon width={16} height={16} className="text-muted transition-transform group-hover:translate-x-0.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm leading-relaxed text-muted">Build a view first. Then you can turn it into a PDF report, a slide deck or an email draft from here, or just ask for one.</p>
                  )}
                </Section>

                <Section title="Or just ask">
                  {!aiAvailable && <p className="text-xs text-muted">These need the live AI, which isn&apos;t configured on this server.</p>}
                  <ul className="grid gap-1.5">
                    {[...(hasView ? VIEW_IDEAS : []), ...ideas].map((idea) => (
                      <li key={idea}>
                        <button
                          type="button"
                          disabled={busy || !aiAvailable}
                          onClick={() => ask(idea)}
                          className="focus-ring w-full rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-left text-sm transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-50"
                        >
                          {idea}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Section>
              </div>
            )}

            {tab === "about" && about && (
              <div role="tabpanel" id={`${panelId}-about`} aria-labelledby={`${panelId}-about-tab`}>
                <AboutTab about={about} roleId={roleId} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
