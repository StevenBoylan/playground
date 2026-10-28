"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRightIcon, CheckIcon, DownloadIcon } from "@/components/shared/icons";
import { CLOSING, GATES, verdictFor, type Gate, type LevelId, type Verdict } from "@/lib/gates/gates";

interface GateState {
  selected: LevelId[];
  threshold: string;
  checked: boolean;
}

const EMPTY: GateState = { selected: [], threshold: "", checked: false };

const LEVELS: { id: LevelId; label: string }[] = [
  { id: "gold", label: "Gold standard" },
  { id: "strong", label: "Strong evidence" },
  { id: "useful", label: "Useful but weaker" },
];

const PDF_URL = "/4gates/The_Four_Gates_StevenBoylan.pdf";

function statusOf(state: GateState): Verdict["kind"] {
  return verdictFor(new Set(state.selected), state.threshold, state.checked).kind;
}

function StatusDot({ kind }: { kind: Verdict["kind"] }) {
  const tone =
    kind === "pass" ? "bg-good" : kind === "retry" || kind === "needs-threshold" ? "bg-warn" : kind === "stop" ? "bg-bad" : "bg-line";
  return <span aria-hidden="true" className={`h-2 w-2 rounded-full ${tone}`} />;
}

function statusText(kind: Verdict["kind"]) {
  switch (kind) {
    case "pass":
      return "earned";
    case "needs-threshold":
      return "declare your threshold";
    case "retry":
      return "test again";
    case "stop":
      return "not enough yet";
    default:
      return "not checked";
  }
}

function VerdictPanel({ gate, verdict }: { gate: Gate; verdict: Verdict }) {
  if (verdict.kind === "empty") return null;
  const tone =
    verdict.kind === "pass"
      ? "border-good/50 bg-good/10"
      : verdict.kind === "stop"
        ? "border-bad/50 bg-bad/10"
        : "border-warn/50 bg-warn/10";
  let title: string;
  let body: string;
  switch (verdict.kind) {
    case "pass":
      title = gate.proceedLabel;
      body = gate.earns;
      break;
    case "needs-threshold":
      title = "Declare your threshold first";
      body = "Strong evidence is only strong against a bar you set before the test. Without one, you are grading your own homework.";
      break;
    case "retry":
      title = gate.retryLabel;
      body = "Weaker evidence is useful, but it isn't enough to move on. Go back and collect something stronger.";
      break;
    default:
      title = "Not enough to proceed";
      body = gate.exitLine.charAt(0).toUpperCase() + gate.exitLine.slice(1) + ".";
  }
  return (
    <div className={`mt-5 rounded-xl border p-4 ${tone}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

export function GatesExplorer() {
  const baseId = useId();
  const [active, setActive] = useState(0);
  const [states, setStates] = useState<GateState[]>(() => GATES.map(() => ({ ...EMPTY })));
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const gate = GATES[active];
  const state = states[active];
  const verdict = verdictFor(new Set(state.selected), state.threshold, state.checked);

  function update(patch: Partial<GateState>) {
    setStates((prev) => prev.map((s, i) => (i === active ? { ...s, ...patch } : s)));
  }
  function toggle(level: LevelId) {
    const has = state.selected.includes(level);
    update({ selected: has ? state.selected.filter((l) => l !== level) : [...state.selected, level] });
  }
  function go(i: number) {
    setActive(i);
    tabRefs.current[i]?.focus();
  }
  function onTabKey(e: KeyboardEvent<HTMLDivElement>) {
    const last = GATES.length - 1;
    const keys: Record<string, number> = {
      ArrowRight: active === last ? 0 : active + 1,
      ArrowLeft: active === 0 ? last : active - 1,
      Home: 0,
      End: last,
    };
    if (e.key in keys) {
      e.preventDefault();
      go(keys[e.key]);
    }
  }

  const earned = states.filter((s) => statusOf(s) === "pass").length;

  return (
    <div>
      <div className="print:hidden">
        {/* Tabs */}
        <div role="tablist" aria-label="The four gates" onKeyDown={onTabKey} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GATES.map((g, i) => {
            const kind = statusOf(states[i]);
            const selected = i === active;
            return (
              <button
                key={g.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                role="tab"
                id={`${baseId}-tab-${g.id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${g.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(i)}
                className={`focus-ring card-lift rounded-2xl border p-3 text-left transition-colors ${
                  selected ? "border-accent bg-accent/10 shadow-[var(--shadow)]" : "border-line bg-surface"
                }`}
              >
                <span className="flex items-center justify-between">
                  <span className="text-lg font-semibold text-accent">{g.number}</span>
                  <StatusDot kind={kind} />
                </span>
                <span className="mt-1 block text-sm font-semibold">{g.name}</span>
                <span className="block text-xs text-muted">{statusText(kind)}</span>
              </button>
            );
          })}
        </div>

        {/* Panel */}
        <section
          role="tabpanel"
          id={`${baseId}-panel-${gate.id}`}
          aria-labelledby={`${baseId}-tab-${gate.id}`}
          tabIndex={0}
          className="card focus-ring mt-4 p-5 sm:p-8"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">
            Gate {gate.number} · reduces {gate.reduces}
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{gate.name}</h2>
          <p className="mt-1 text-xl font-medium text-muted">{gate.question}</p>

          <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
            <div>
              {gate.summary.map((p) => (
                <p key={p.slice(0, 24)} className="mb-3 leading-relaxed">
                  {p}
                </p>
              ))}
              <blockquote className="my-5 border-l-4 border-accent pl-4 text-lg font-medium italic leading-snug">{gate.pullQuote}</blockquote>

              {gate.askYourself && (
                <div className="mb-5">
                  <h3 className="text-sm font-semibold">Ask yourself some uncomfortable questions</h3>
                  <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted">
                    {gate.askYourself.map((q) => (
                      <li key={q} className="flex gap-2">
                        <span aria-hidden="true" className="text-accent">
                          –
                        </span>
                        {q}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-sm text-muted">If the answer to any of these is yes, you haven&apos;t built a product yet. You&apos;ve built a successful pilot.</p>
                </div>
              )}

              <div className="rounded-xl bg-surface-2 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-widest">{gate.failures.heading}</h3>
                <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
                  {gate.failures.items.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span aria-hidden="true" className="text-accent">
                        –
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Evidence check */}
            <div>
              <h3 className="text-lg font-semibold">Check your evidence</h3>
              <p className="mt-1 text-sm text-muted">Evidence, not intentions. Tick only what you can show.</p>

              <div className="mt-4">
                <label htmlFor={`${baseId}-threshold`} className="text-sm font-semibold">
                  {gate.thresholdLabel}
                </label>
                <p id={`${baseId}-threshold-hint`} className="text-xs text-muted">
                  {gate.thresholdHint}
                </p>
                <textarea
                  id={`${baseId}-threshold`}
                  aria-describedby={`${baseId}-threshold-hint`}
                  value={state.threshold}
                  onChange={(e) => update({ threshold: e.target.value })}
                  rows={2}
                  maxLength={400}
                  className="focus-ring mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm"
                />
              </div>

              <fieldset className="mt-4">
                <legend className="text-sm font-semibold">Evidence hierarchy</legend>
                <ul className="mt-2 space-y-2">
                  {LEVELS.map((l) => {
                    const id = `${baseId}-${gate.id}-${l.id}`;
                    const on = state.selected.includes(l.id);
                    return (
                      <li key={l.id}>
                        <label
                          htmlFor={id}
                          className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm leading-relaxed transition-colors ${
                            on ? "border-accent bg-accent/10" : "border-line bg-surface"
                          }`}
                        >
                          <input id={id} type="checkbox" checked={on} onChange={() => toggle(l.id)} className="focus-ring mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" />
                          <span>
                            <span className="font-semibold">{l.label}: </span>
                            <span className="text-muted">{gate.levels[l.id]}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                  <li className="rounded-xl border border-dashed border-line p-3 text-sm leading-relaxed text-muted">
                    <span className="font-semibold text-ink">Not enough on their own: </span>
                    {gate.notEnough}
                  </li>
                </ul>
              </fieldset>

              <button
                type="button"
                onClick={() => update({ checked: true })}
                className="focus-ring mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-end))" }}
              >
                <CheckIcon width={16} height={16} />
                Check my evidence
              </button>

              <div aria-live="polite">
                <VerdictPanel gate={gate} verdict={verdict} />
              </div>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-line pt-4">
            <button
              type="button"
              onClick={() => go(Math.max(0, active - 1))}
              disabled={active === 0}
              className="focus-ring rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:text-ink disabled:opacity-40"
            >
              ← Previous gate
            </button>
            {active < GATES.length - 1 ? (
              <button
                type="button"
                onClick={() => go(active + 1)}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-accent hover:underline"
              >
                Next gate <ArrowRightIcon width={16} height={16} />
              </button>
            ) : (
              <span className="text-sm text-muted">{gate.earns}</span>
            )}
          </div>
        </section>

        {/* Summary */}
        <section aria-labelledby={`${baseId}-summary`} className="card mt-6 p-5 sm:p-8">
          <h2 id={`${baseId}-summary`} className="text-2xl font-semibold tracking-tight">
            {CLOSING.title}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {earned} of {GATES.length} gates earned in this session. Nothing you type here leaves your browser.
          </p>
          <ol className="mt-4 grid gap-2 sm:grid-cols-4">
            {GATES.map((g, i) => {
              const kind = statusOf(states[i]);
              return (
                <li key={g.id} className="flex items-center gap-2 rounded-xl border border-line bg-surface p-3 text-sm">
                  <StatusDot kind={kind} />
                  <span>
                    <span className="font-semibold">
                      {g.number} {g.name}
                    </span>
                    <span className="block text-xs text-muted">{statusText(kind)}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="mt-5 max-w-3xl space-y-3 leading-relaxed">
            {CLOSING.paras.map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>
          <p className="mt-5 rounded-xl bg-accent/10 p-4 text-center text-lg font-semibold text-accent">{CLOSING.line}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="focus-ring rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium hover:border-accent"
            >
              Print the one-page canvas
            </button>
            <a
              href={PDF_URL}
              className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium hover:border-accent"
            >
              <DownloadIcon width={16} height={16} /> Download the full guide (PDF)
            </a>
            <button
              type="button"
              onClick={() => {
                setStates(GATES.map(() => ({ ...EMPTY })));
                setActive(0);
              }}
              className="focus-ring rounded-xl px-4 py-2 text-sm font-medium text-muted hover:text-ink"
            >
              Start again
            </button>
          </div>
        </section>
      </div>

      {/* Printed canvas: the standalone one-page version from the guide. */}
      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">THE FOUR GATES — ONE-PAGE CANVAS</h1>
        <p className="mt-1 text-sm">The standalone version. Print it, hand it out, compare answers. Name: ______________________</p>
        {GATES.map((g) => (
          <div key={g.id} className="mt-6 break-inside-avoid">
            <h2 className="text-lg font-bold">
              {g.number} {g.name.toUpperCase()}
            </h2>
            <p className="text-sm italic">{g.question}</p>
            <div className="mt-6 border-b border-black" />
            <p className="mt-2 text-sm font-semibold">
              ☐ {g.proceedLabel} &nbsp;&nbsp; ☐ {g.retryLabel} &nbsp;&nbsp; ☐ {g.id === "productisation" ? "Back to 01" : "Stop"}
            </p>
          </div>
        ))}
        <p className="mt-8 text-xs">stevenboylan.eu</p>
      </div>
    </div>
  );
}
