"use client";

import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { evaluate, MIN_STRENGTH, type ShownOffer } from "@/lib/life/engine";
import type { Flag, LifeData, Sensitivity } from "@/lib/life/types";

type Tab = "offers" | "behind";

/**
 * The app has its own look, on purpose: a warm shopping palette inside a phone-style frame, so it reads as a separate
 * product from the site around it. The tokens below override the Playground's for everything inside the frame, and the
 * frame stays light whatever the visitor's system theme is.
 */
const APP_THEME = {
  "--bg": "#fff7f0",
  "--surface": "#ffffff",
  "--surface-2": "#ffebdd",
  "--line": "#f1dccb",
  "--text": "#1f1410",
  "--muted": "#6b5548",
  "--accent": "#c2410c",
  "--accent-end": "#c2410c",
  "--shadow": "0 1px 2px rgb(120 53 15 / 0.06), 0 8px 22px -12px rgb(120 53 15 / 0.25)",
  colorScheme: "light",
} as CSSProperties;

const DEAL = "#ffd43b";
/** The offer the banner leads with: the one that comes from several signals converging. */
const FEATURED_OFFER = "o-cyprus";
const CATEGORY_ICON: Record<string, string> = { trip: "✈️", move: "🏃" };
const CATEGORY_TINT: Record<string, string> = {
  trip: "linear-gradient(135deg, #ffe9d9, #ffc9a3)",
  move: "linear-gradient(135deg, #ffe3cf, #ffcfa8)",
};

const price = (p: number) => (p === 0 ? "Free" : `€${p}`);
const discount = (offer: { price: number; was?: number }) =>
  offer.was && offer.was > offer.price ? Math.round(((offer.was - offer.price) / offer.was) * 100) : 0;

const SENSITIVITY: Record<Sensitivity, string> = { low: "Low sensitivity", medium: "Medium sensitivity", high: "High sensitivity" };

function SourceSwitches({ data, enabled, onToggle }: { data: LifeData; enabled: ReadonlySet<string>; onToggle: (id: string) => void }) {
  return (
    <ul className="space-y-2">
      {data.sources.map((s) => {
        const on = enabled.has(s.id);
        return (
          <li key={s.id} className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-surface p-3">
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
              <span aria-hidden="true" className={`absolute top-0.5 h-5 w-5 rounded-full shadow transition-all ${on ? "left-[1.35rem] bg-white" : "left-0.5 bg-muted"}`} />
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
  const steps: { title: string; body: ReactNode }[] = [
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
    <ol className="mt-3 space-y-3 rounded-2xl bg-surface-2 p-3 text-sm text-muted">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3">
          <span aria-hidden="true" className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-white">
            {i + 1}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-ink">{s.title}</p>
            <div className="leading-relaxed">{s.body}</div>
          </div>
        </li>
      ))}
      {item.missing.length > 0 && <li className="rounded-lg bg-surface p-2 text-xs">Not in the evidence: {item.missing.map((f) => f.short).join(", ")}.</li>}
    </ol>
  );
}

/** How the evidence behind an offer built up, week by week, from when each signal first appeared. */
function EvidenceBuild({ item }: { item: ShownOffer }) {
  const total = item.active.reduce((n, f) => n + (f.weeksAgo === undefined ? 0 : 1), 0);
  if (total < 2) return null;
  const weights = new Map(item.offer.flags.map((r) => [r.flagId, r.weight]));
  const all = item.active.map((f) => ({ f, w: weights.get(f.id) ?? 0 }));
  const sum = all.reduce((n, a) => n + a.w, 0);
  const start = Math.max(...all.map((a) => a.f.weeksAgo ?? 0));
  const points = Array.from({ length: start + 1 }, (_, i) => {
    const weeksAgo = start - i;
    const share = all.filter((a) => (a.f.weeksAgo ?? 0) >= weeksAgo).reduce((n, a) => n + a.w, 0) / (sum || 1);
    return { weeksAgo, pct: Math.round(share * item.strength * 100) };
  });
  return (
    <div className="mt-3 rounded-2xl bg-surface-2 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-ink">Intent building over {start} weeks</p>
      <div className="mt-2 flex h-16 items-end gap-1" role="img" aria-label={`Match rising from ${points[0].pct}% to ${points[points.length - 1].pct}%`}>
        {points.map((p) => (
          <div key={p.weeksAgo} className="flex-1 rounded-t bg-accent" style={{ height: `${Math.max(p.pct, 4)}%`, opacity: 0.35 + p.pct / 160 }} title={`${p.weeksAgo === 0 ? "Now" : `${p.weeksAgo} weeks ago`}: ${p.pct}%`} />
        ))}
      </div>
      <ul className="mt-2 space-y-0.5 text-xs text-muted">
        {[...item.active]
          .filter((f) => f.weeksAgo !== undefined)
          .sort((a, b) => (b.weeksAgo ?? 0) - (a.weeksAgo ?? 0))
          .map((f) => (
            <li key={f.id}>
              <span className="font-semibold text-ink">{f.weeksAgo === 0 ? "Now" : `${f.weeksAgo} wk ago`}</span> · {f.short}
            </li>
          ))}
      </ul>
    </div>
  );
}

function DealBadge({ offer }: { offer: { price: number; was?: number } }) {
  const off = discount(offer);
  const label = offer.price === 0 ? "FREE" : off > 0 ? `${off}% OFF` : null;
  if (!label) return null;
  return (
    <span className="absolute left-3 top-3 rounded-md px-2 py-1 text-[11px] font-extrabold tracking-wide text-ink shadow-sm" style={{ background: DEAL }}>
      {label}
    </span>
  );
}

function OfferCard({ data, item, best }: { data: LifeData; item: ShownOffer; best: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { offer } = item;
  const pct = Math.round(item.strength * 100);
  return (
    <li className="card overflow-hidden">
      <div className="relative flex h-24 items-center justify-center text-5xl" style={{ background: CATEGORY_TINT[offer.categoryId] ?? CATEGORY_TINT.move }} aria-hidden="true">
        <span>{CATEGORY_ICON[offer.categoryId] ?? "🛍️"}</span>
        <DealBadge offer={offer} />
        <span className="absolute right-3 top-3 rounded-full bg-surface px-2 py-1 text-[11px] font-bold text-ink shadow-sm">{pct}% match</span>
      </div>
      <div className="p-4">
        <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
          <span>{offer.merchant}</span>
          {best && <span className="rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-bold text-white">Top pick</span>}
        </p>
        <h3 className="mt-1 text-base font-bold leading-snug">{offer.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{offer.blurb}</p>

        <div className="mt-3 flex items-end justify-between gap-3">
          <p className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold tracking-tight text-accent">{price(offer.price)}</span>
            {offer.was !== undefined && <span className="text-sm text-muted line-through">€{offer.was}</span>}
          </p>
          <p className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink">⏱ {offer.ends}</p>
        </div>

        {item.held && (
          <p className="mt-3 rounded-xl border border-line bg-surface-2 p-2.5 text-xs leading-relaxed text-ink">
            <span className="font-bold">Finance agent:</span> {item.held}
          </p>
        )}
        <EvidenceBuild item={item} />

        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Why this offer">
          {item.active.map((f) => (
            <li key={f.id} className="rounded-full border border-line bg-bg px-2 py-0.5 text-xs text-muted">
              {f.short}
            </li>
          ))}
        </ul>

        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="focus-ring mt-4 w-full rounded-xl bg-accent px-4 py-3 text-sm font-bold text-white"
        >
          {open ? "Hide why this is shown" : "Why is this shown?"}
        </button>
        <div id={panelId} hidden={!open}>
          {open && <Trace data={data} item={item} />}
        </div>
      </div>
    </li>
  );
}

function FlagGroup({ data, sourceId, enabled }: { data: LifeData; sourceId: string; enabled: boolean }) {
  const source = data.sources.find((s) => s.id === sourceId);
  const flags = data.flags.filter((f) => f.sourceId === sourceId && f.raised !== false);
  if (!source) return null;
  return (
    <section className={`card p-4 ${enabled ? "" : "opacity-60"}`}>
      <h4 className="text-sm font-bold">
        {source.name} <span className="font-normal text-muted">{enabled ? "" : "(off)"}</span>
      </h4>
      <dl className="mt-2 space-y-1 text-xs text-muted">
        <div>
          <dt className="inline font-semibold text-ink">Reads: </dt>
          <dd className="inline">{source.sees}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-ink">Never reads: </dt>
          <dd className="inline">{source.neverSees}</dd>
        </div>
      </dl>
      {flags.length === 0 && <p className="mt-3 text-sm text-muted">Nothing raised from this source right now.</p>}
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

const TAB_ICON: Record<Tab, ReactNode> = {
  offers: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z" />
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" />
    </svg>
  ),
  behind: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M7.7 7.8 11 15.6M16.3 7.8 13 15.6M8.5 6h7" />
    </svg>
  ),
};

export function LifeApp({ data }: { data: LifeData }) {
  const [tab, setTab] = useState<Tab>("offers");
  const [enabled, setEnabled] = useState<ReadonlySet<string>>(() => new Set(data.sources.map((s) => s.id)));

  const toggle = (id: string) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { shown, withheld } = useMemo(() => evaluate(data, enabled), [data, enabled]);
  const visible = shown;
  const featured = shown.find((s) => s.offer.id === FEATURED_OFFER) ?? shown[0];
  const tabs: { id: Tab; label: string }[] = [
    { id: "offers", label: "Offers" },
    { id: "behind", label: "Behind the scenes" },
  ];

  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setTab((t) => (t === "offers" ? "behind" : "offers"));
  };

  return (
    <div
      style={APP_THEME}
      className="mx-auto flex w-full max-w-[26rem] flex-col overflow-hidden bg-bg text-ink sm:rounded-[2.75rem] sm:border-[10px] sm:border-[#1c1410] sm:shadow-[0_30px_60px_-20px_rgb(28_20_16/0.5)] lg:h-[800px]"
    >
      {/* App bar. The notch is decoration for the frame, hidden on a real phone. */}
      <div className="relative shrink-0 bg-bg px-4 pb-3 pt-3 sm:pt-5">
        <div aria-hidden="true" className="absolute left-1/2 top-1.5 hidden h-5 w-24 -translate-x-1/2 rounded-full bg-[#1c1410] sm:block" />
        <div className="flex items-center justify-between sm:mt-3">
          <p className="text-2xl font-extrabold tracking-tight text-accent">
            nudge<span style={{ color: DEAL, WebkitTextStroke: "0.5px #1f1410" }}>.</span>
          </p>
          <p className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-ink">Picked for you</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 [scrollbar-width:thin]">
        <div id="panel-offers" role="tabpanel" aria-labelledby="tab-offers" hidden={tab !== "offers"}>
          {tab === "offers" && (
            <>
              {featured && (
                <div className="relative overflow-hidden rounded-3xl p-5 text-white" style={{ background: "linear-gradient(135deg, #b53a09, #d4470e)" }}>
                  <p className="text-xs font-bold uppercase tracking-widest text-white">New offer for you</p>
                  <p className="mt-2 text-xl font-extrabold leading-tight">{featured.offer.title}</p>
                  <p className="mt-1 text-sm text-white">
                    {featured.offer.merchant} · {price(featured.offer.price)}
                    {featured.offer.was !== undefined ? ` (was €${featured.offer.was})` : ""}
                  </p>
                  <p className="mt-3 inline-block rounded-md px-2 py-1 text-xs font-extrabold text-ink" style={{ background: DEAL }}>
                    {Math.round(featured.strength * 100)}% match for you
                  </p>
                  <span aria-hidden="true" className="absolute -right-3 -top-3 text-7xl opacity-30">
                    {CATEGORY_ICON[featured.offer.categoryId]}
                  </span>
                </div>
              )}

              <details className="mt-4 rounded-2xl border border-line bg-surface p-3">
                <summary className="focus-ring cursor-pointer rounded text-sm font-bold">
                  Data sources <span className="font-normal text-muted">({enabled.size} of {data.sources.length} on)</span>
                </summary>
                <p className="mt-2 text-xs text-muted">Switch one off and watch the offers that depended on it change.</p>
                <div className="mt-3">
                  <SourceSwitches data={data} enabled={enabled} onToggle={toggle} />
                </div>
              </details>

              <p className="mt-4 text-sm font-semibold text-muted" aria-live="polite">
                {visible.length} {visible.length === 1 ? "offer" : "offers"} picked for you
              </p>
              {visible.length === 0 ? (
                <p className="card mt-3 p-4 text-sm text-muted">Nothing here has enough evidence behind it right now. Switch a source back on.</p>
              ) : (
                <ul className="mt-3 space-y-4">
                  {visible.map((item) => (
                    <OfferCard key={item.offer.id} data={data} item={item} best={item.offer.id === shown[0]?.offer.id} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div id="panel-behind" role="tabpanel" aria-labelledby="tab-behind" hidden={tab !== "behind"} className="space-y-8">
          {tab === "behind" && (
            <>
              <section>
                <h2 className="text-xl font-extrabold tracking-tight">How these offers are made</h2>
                <ol className="mt-3 space-y-2 text-sm text-muted">
                  {[
                    ["Source agents", "One per service. Each reads only what it is allowed to and raises coarse flags."],
                    ["Flags", "Short statements such as “mileage rising”, never raw records."],
                    ["Intent agent", "Combines flags from different sources into a latent intent, before they have searched for anything."],
                    ["Commerce agent", `Builds offers for those intents, and holds back anything that lacks evidence (under ${Math.round(MIN_STRENGTH * 100)}% of it available) or breaks the rules they set.`],
                  ].map(([title, body], i) => (
                    <li key={title} className="card flex gap-3 p-3">
                      <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                        {i + 1}
                      </span>
                      <p>
                        <span className="font-bold text-ink">{title}.</span> {body}
                      </p>
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <h2 className="text-xl font-extrabold tracking-tight">Sources</h2>
                <p className="mt-1 text-sm text-muted">The user is in control. Switching a source off removes its flags straight away.</p>
                <div className="mt-3">
                  <SourceSwitches data={data} enabled={enabled} onToggle={toggle} />
                </div>
              </section>

              <section>
                <h2 className="text-xl font-extrabold tracking-tight">Flags raised</h2>
                <div className="mt-3 space-y-3">
                  {data.sources.map((s) => (
                    <FlagGroup key={s.id} data={data} sourceId={s.id} enabled={enabled.has(s.id)} />
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-xl font-extrabold tracking-tight">Intents inferred</h2>
                <ul className="mt-3 space-y-2">
                  {data.intents.map((i) => (
                    <li key={i.id} className="card p-3 text-sm">
                      <p className="font-bold">{i.label}</p>
                      <p className="mt-1 text-muted">{i.summary}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-extrabold tracking-tight">Held back</h2>
                <p className="mt-1 text-sm text-muted">Offers the commerce agent built but did not show, and why.</p>
                {withheld.length === 0 ? (
                  <p className="card mt-3 p-3 text-sm text-muted">Nothing is being held back.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {withheld.map((w) => (
                      <li key={w.offer.id} className="card p-3 text-sm">
                        <p className="font-bold">
                          {w.offer.title} <span className="font-normal text-muted">· {price(w.offer.price)}</span>
                        </p>
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

      {/* Bottom tab bar, as in a shopping app. */}
      <div role="tablist" aria-label="View" onKeyDown={onTabKey} className="sticky bottom-0 z-10 grid shrink-0 grid-cols-2 border-t border-line bg-surface sm:static">
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
            className={`focus-ring flex flex-col items-center gap-0.5 px-3 pb-4 pt-2.5 text-xs font-bold sm:pb-5 ${tab === t.id ? "text-accent" : "text-muted"}`}
          >
            {TAB_ICON[t.id]}
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
