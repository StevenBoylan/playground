"use client";

import { useId, useMemo, useState } from "react";
import { evaluate, MIN_STRENGTH, type ShownOffer } from "@/lib/life/engine";
import type { Flag, LifeData, Sensitivity } from "@/lib/life/types";

type Tab = "offers" | "behind";

const price = (p: number) => (p === 0 ? "Free" : `€${p}`);

const SENSITIVITY: Record<Sensitivity, string> = { low: "Low sensitivity", medium: "Medium sensitivity", high: "High sensitivity" };

function SourceSwitches({ data, enabled, onToggle }: { data: LifeData; enabled: ReadonlySet<string>; onToggle: (id: string) => void }) {
  return (
    <ul className="space-y-2">
      {data.sources.map((s) => {
        const on = enabled.has(s.id);
        return (
          <li key={s.id} className="flex items-start justify-between gap-3 rounded-xl border border-line bg-surface p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{s.name}</p>
              <p className="text-xs text-muted">{s.role}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={`${s.name}: ${on ? "on" : "off"}`}
              onClick={() => onToggle(s.id)}
              className={`focus-ring relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition-colors ${on ? "border-accent bg-accent" : "border-line bg-surface-2"}`}
            >
              <span
                aria-hidden="true"
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[1.35rem]" : "left-0.5 !bg-muted"}`}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Trace({ data, item }: { data: LifeData; item: ShownOffer }) {
  const intent = data.intents.find((i) => i.id === item.offer.intentId);
  const sources = [...new Set(item.active.map((f) => data.sources.find((s) => s.id === f.sourceId)?.name ?? f.sourceId))];
  const steps: { title: string; body: React.ReactNode }[] = [
    { title: "Sources", body: sources.join(", ") },
    {
      title: "Flags raised",
      body: (
        <ul className="mt-1 space-y-1">
          {item.active.map((f) => (
            <li key={f.id}>
              <span className="font-medium text-ink">{f.short}.</span> {f.label}
            </li>
          ))}
        </ul>
      ),
    },
    { title: "Intent inferred", body: intent ? `${intent.label}. ${intent.summary}` : "" },
    { title: "Commerce agent", body: item.offer.reasoning },
    { title: "Offer", body: `${item.offer.title}, ${price(item.offer.price)}, from ${item.offer.merchant}.` },
  ];
  return (
    <ol className="mt-3 space-y-3 border-t border-line pt-3 text-sm text-muted">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3">
          <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink">{s.title}</p>
            <div className="leading-relaxed">{s.body}</div>
          </div>
        </li>
      ))}
      {item.missing.length > 0 && (
        <li className="rounded-lg bg-surface-2 p-2 text-xs">
          Weaker without: {item.missing.map((f) => f.short).join(", ")}.
        </li>
      )}
    </ol>
  );
}

function OfferCard({ data, item, best, categoryLabel }: { data: LifeData; item: ShownOffer; best: boolean; categoryLabel: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { offer } = item;
  const pct = Math.round(item.strength * 100);
  return (
    <li className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted">
            <span className="rounded-full bg-surface-2 px-2 py-0.5">{categoryLabel}</span>
            {best && <span className="rounded-full px-2 py-0.5 font-semibold text-white" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-end))" }}>Best match</span>}
          </p>
          <h3 className="mt-2 text-lg font-semibold leading-snug tracking-tight">{offer.title}</h3>
          <p className="text-sm text-muted">{offer.merchant}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-bold tracking-tight">{price(offer.price)}</p>
          {offer.was !== undefined && <p className="text-xs text-muted line-through">€{offer.was}</p>}
        </div>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">{offer.blurb}</p>
      <p className="mt-2 text-xs font-medium text-ink">{offer.ends}</p>

      <div className="mt-3 flex items-center gap-2" role="img" aria-label={`Match ${pct} percent`}>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--accent), var(--accent-end))" }} />
        </div>
        <span className="text-xs font-semibold tabular-nums text-ink" aria-hidden="true">{pct}%</span>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Why this offer">
        {item.active.map((f) => (
          <li key={f.id} className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">{f.short}</li>
        ))}
      </ul>

      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-lg py-1 text-sm font-semibold text-accent"
      >
        {open ? "Hide how this was made" : "How was this made?"}
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <div id={panelId} hidden={!open}>
        {open && <Trace data={data} item={item} />}
      </div>
    </li>
  );
}

function FlagGroup({ data, sourceId, enabled }: { data: LifeData; sourceId: string; enabled: boolean }) {
  const source = data.sources.find((s) => s.id === sourceId);
  const flags = data.flags.filter((f) => f.sourceId === sourceId);
  if (!source) return null;
  return (
    <section className={`card p-4 ${enabled ? "" : "opacity-60"}`}>
      <h4 className="text-sm font-semibold">
        {source.name} <span className="font-normal text-muted">{enabled ? "" : "(off)"}</span>
      </h4>
      <dl className="mt-2 space-y-1 text-xs text-muted">
        <div><dt className="inline font-semibold text-ink">Reads: </dt><dd className="inline">{source.sees}</dd></div>
        <div><dt className="inline font-semibold text-ink">Never reads: </dt><dd className="inline">{source.neverSees}</dd></div>
      </dl>
      <ul className="mt-3 space-y-2">
        {flags.map((f: Flag) => (
          <li key={f.id} className="rounded-lg bg-surface-2 p-2 text-sm">
            {f.label}
            <span className="mt-1 block text-xs text-muted">{SENSITIVITY[f.sensitivity]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LifeApp({ data }: { data: LifeData }) {
  const [tab, setTab] = useState<Tab>("offers");
  const [category, setCategory] = useState<string>("all");
  const [enabled, setEnabled] = useState<ReadonlySet<string>>(() => new Set(data.sources.map((s) => s.id)));

  const toggle = (id: string) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { shown, withheld } = useMemo(() => evaluate(data, enabled), [data, enabled]);
  const categoryLabel = (id: string) => data.categories.find((c) => c.id === id)?.label ?? id;
  const visible = category === "all" ? shown : shown.filter((s) => s.offer.categoryId === category);
  const tabs: { id: Tab; label: string }[] = [
    { id: "offers", label: "My offers" },
    { id: "behind", label: "Behind the scenes" },
  ];

  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setTab((t) => (t === "offers" ? "behind" : "offers"));
  };

  return (
    <div>
      <div role="tablist" aria-label="View" onKeyDown={onTabKey} className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-2 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={`focus-ring rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${tab === t.id ? "bg-surface text-ink shadow-sm" : "text-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="panel-offers" role="tabpanel" aria-labelledby="tab-offers" hidden={tab !== "offers"} className="mt-5">
        {tab === "offers" && (
          <>
            <div className="-mx-4 overflow-x-auto px-4 pb-1">
              <ul className="flex w-max gap-2" aria-label="Categories">
                {[{ id: "all", label: "All" }, ...data.categories].map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      aria-pressed={category === c.id}
                      onClick={() => setCategory(c.id)}
                      className={`focus-ring whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium ${category === c.id ? "border-accent bg-accent text-white" : "border-line bg-surface text-muted"}`}
                    >
                      {c.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <details className="mt-4 rounded-xl border border-line bg-surface p-3">
              <summary className="focus-ring cursor-pointer rounded text-sm font-semibold">
                Data sources <span className="font-normal text-muted">({enabled.size} of {data.sources.length} on)</span>
              </summary>
              <p className="mt-2 text-xs text-muted">Switch one off and watch the offers that depended on it change.</p>
              <div className="mt-3"><SourceSwitches data={data} enabled={enabled} onToggle={toggle} /></div>
            </details>

            <p className="mt-4 text-sm text-muted" aria-live="polite">
              {visible.length} {visible.length === 1 ? "offer" : "offers"} picked for me{category !== "all" ? ` in ${categoryLabel(category)}` : ""}.
            </p>
            {visible.length === 0 ? (
              <p className="card mt-3 p-4 text-sm text-muted">Nothing here has enough evidence behind it right now. Switch a source back on, or try another category.</p>
            ) : (
              <ul className="mt-3 space-y-4">
                {visible.map((item) => (
                  <OfferCard key={item.offer.id} data={data} item={item} best={item.offer.id === shown[0]?.offer.id} categoryLabel={categoryLabel(item.offer.categoryId)} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div id="panel-behind" role="tabpanel" aria-labelledby="tab-behind" hidden={tab !== "behind"} className="mt-5 space-y-8">
        {tab === "behind" && (
          <>
            <section>
              <h2 className="text-xl font-semibold tracking-tight">How these offers are made</h2>
              <ol className="mt-3 space-y-2 text-sm text-muted">
                {[
                  ["Source agents", "One per service. Each reads only what it is allowed to and raises coarse flags."],
                  ["Flags", "Short statements such as “mileage rising”, never raw records."],
                  ["Intent agent", "Combines flags from different sources into a latent intent, before I have searched for anything."],
                  ["Commerce agent", `Builds offers for those intents, and holds back anything that lacks evidence (under ${Math.round(MIN_STRENGTH * 100)}% of it available) or breaks my own rules.`],
                ].map(([title, body], i) => (
                  <li key={title} className="card flex gap-3 p-3">
                    <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">{i + 1}</span>
                    <p><span className="font-semibold text-ink">{title}.</span> {body}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight">Sources</h2>
              <p className="mt-1 text-sm text-muted">I am in control. Switching a source off removes its flags straight away.</p>
              <div className="mt-3"><SourceSwitches data={data} enabled={enabled} onToggle={toggle} /></div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight">Flags raised</h2>
              <div className="mt-3 space-y-3">
                {data.sources.map((s) => <FlagGroup key={s.id} data={data} sourceId={s.id} enabled={enabled.has(s.id)} />)}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight">Intents inferred</h2>
              <ul className="mt-3 space-y-2">
                {data.intents.map((i) => (
                  <li key={i.id} className="card p-3 text-sm">
                    <p className="font-semibold">{i.label}</p>
                    <p className="mt-1 text-muted">{i.summary}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold tracking-tight">Held back</h2>
              <p className="mt-1 text-sm text-muted">Offers the commerce agent built but did not show, and why.</p>
              {withheld.length === 0 ? (
                <p className="card mt-3 p-3 text-sm text-muted">Nothing is being held back.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {withheld.map((w) => (
                    <li key={w.offer.id} className="card p-3 text-sm">
                      <p className="font-semibold">{w.offer.title} <span className="font-normal text-muted">· {price(w.offer.price)}</span></p>
                      <p className="mt-1 text-muted">{w.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
