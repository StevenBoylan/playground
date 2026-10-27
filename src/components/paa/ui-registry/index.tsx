"use client";

import { useId, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertIcon, CalendarIcon, FilterIcon, InfoIcon, SparklesIcon } from "@/components/shared/icons";
import { formatValue, type Format } from "@/lib/paa/format";
import { renderTemplate, resolveRef, type Envelope } from "@/lib/paa/schemas/bindings";
import type { ExperienceComponent } from "@/lib/paa/schemas/experience";

type Of<T extends ExperienceComponent["type"]> = Extract<ExperienceComponent, { type: T }>;
interface Props<T extends ExperienceComponent["type"]> {
  component: Of<T>;
  envelope: Envelope;
}

const PALETTE = ["#6366f1", "#06b6d4", "#f59e0b", "#ec4899", "#10b981", "#8b5cf6", "#f97316"];
const NUMERIC: Format[] = ["integer", "number", "percent", "minutes"];

const AXIS = { tick: { fill: "var(--muted)", fontSize: 12 }, axisLine: false, tickLine: false } as const;
const TOOLTIP = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    boxShadow: "var(--shadow-lift)",
    color: "var(--text)",
    fontSize: 13,
    padding: "8px 12px",
  },
  labelStyle: { color: "var(--muted)", marginBottom: 2 },
  itemStyle: { color: "var(--text)" },
} as const;
const HOVER_CURSOR = { fill: "color-mix(in srgb, var(--accent) 9%, transparent)" };

function rowsOf(envelope: Envelope, ref: string): Record<string, unknown>[] {
  const value = resolveRef(envelope, ref);
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function Panel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      <h3 className="mb-4 text-sm font-semibold tracking-tight">{title}</h3>
      {children}
    </section>
  );
}

function ChartFrame({ label, height = 288, children }: { label: string; height?: number; children: ReactNode }) {
  return (
    <div role="img" aria-label={`${label}. The same data is available in the table view where shown.`} style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {/* Recharts requires a single chart element child. */}
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

export function PageHeading({ component }: Props<"PageHeading">) {
  return (
    <header>
      <h2 className="text-3xl font-semibold tracking-tight sm:text-[2rem]">{component.text}</h2>
      {component.subtitle && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
          <CalendarIcon width={14} height={14} />
          {component.subtitle}
        </p>
      )}
    </header>
  );
}

export function Narrative({ component, envelope }: Props<"Narrative">) {
  return (
    <aside
      className="card relative overflow-hidden p-5 pl-6"
      style={{ background: "linear-gradient(120deg, color-mix(in srgb, var(--accent) 9%, var(--surface)), var(--surface) 70%)" }}
    >
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: "var(--accent)" }} aria-hidden="true" />
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
        <SparklesIcon width={14} height={14} />
        Insight
      </p>
      <p className="text-lg leading-relaxed">{renderTemplate(component.template, envelope)}</p>
    </aside>
  );
}

export function KpiCard({ component, envelope }: Props<"KpiCard">) {
  return (
    <section className="card relative overflow-hidden p-5">
      <span
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: "linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 30%, transparent))" }}
        aria-hidden="true"
      />
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{component.title}</p>
      <p className="accent-ink mt-2 text-4xl font-semibold tabular-nums tracking-tight">
        {formatValue(resolveRef(envelope, component.dataRef), component.format)}
      </p>
    </section>
  );
}

function xAxisFor(count: number, field: string) {
  const crowded = count > 6;
  return {
    dataKey: field,
    ...AXIS,
    interval: (crowded ? "preserveStartEnd" : 0) as "preserveStartEnd" | 0,
    ...(crowded ? { angle: -28, textAnchor: "end" as const, height: 64, padding: { left: 28, right: 8 } } : {}),
  };
}

export function LineChartView({ component, envelope }: Props<"LineChart">) {
  const data = rowsOf(envelope, component.dataRef);
  const fmt: Format = component.format ?? "number";
  const gradientId = `area-${useId().replace(/:/g, "")}`;
  return (
    <Panel title={component.title}>
      <ChartFrame label={component.title}>
        <AreaChart data={data} margin={{ top: 8, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--accent)", stopOpacity: 0.35 }} />
              <stop offset="100%" style={{ stopColor: "var(--accent)", stopOpacity: 0.02 }} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis {...xAxisFor(data.length, component.xField)} />
          <YAxis {...AXIS} tickFormatter={(v) => formatValue(v, fmt)} width={fmt === "minutes" ? 84 : 64} />
          <Tooltip {...TOOLTIP} formatter={(v) => formatValue(v, fmt)} />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey={component.yField}
            stroke="var(--accent)"
            strokeWidth={2.5}
            fill={`url(#${gradientId})`}
            dot={{ r: 3, strokeWidth: 2, fill: "var(--surface)", stroke: "var(--accent)" }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ChartFrame>
    </Panel>
  );
}

export function BarChartView({ component, envelope }: Props<"BarChart">) {
  const data = rowsOf(envelope, component.dataRef);
  const fmt: Format = component.format ?? "number";
  const values = data.map((d) => Number(d[component.yField]));
  const hasNegative = values.some((v) => v < 0);
  const max = Math.max(...values.map(Math.abs), 0);
  // Emphasise the largest bar; show negatives in a neutral tone so direction reads at a glance.
  const fill = (v: number) =>
    hasNegative && v < 0
      ? "color-mix(in srgb, var(--muted) 55%, transparent)"
      : Math.abs(v) === max
        ? "var(--accent)"
        : "color-mix(in srgb, var(--accent) 42%, transparent)";
  return (
    <Panel title={component.title}>
      <ChartFrame label={component.title}>
        <RBarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis {...xAxisFor(data.length, component.xField)} />
          <YAxis {...AXIS} tickFormatter={(v) => formatValue(v, fmt)} width={fmt === "minutes" ? 84 : 64} />
          <Tooltip {...TOOLTIP} cursor={HOVER_CURSOR} formatter={(v) => formatValue(v, fmt)} />
          <Bar isAnimationActive={false} dataKey={component.yField} radius={[8, 8, 0, 0]} maxBarSize={56}>
            {values.map((v, i) => (
              <Cell key={i} fill={fill(v)} />
            ))}
          </Bar>
        </RBarChart>
      </ChartFrame>
    </Panel>
  );
}

export function DonutChartView({ component, envelope }: Props<"DonutChart">) {
  const data = rowsOf(envelope, component.dataRef);
  const fmt: Format = component.format ?? "number";
  return (
    <Panel title={component.title}>
      <ChartFrame label={component.title} height={300}>
        <PieChart>
          <Pie
            isAnimationActive={false}
            data={data}
            dataKey={component.valueField}
            nameKey={component.nameField}
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            stroke="var(--surface)"
            strokeWidth={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip {...TOOLTIP} formatter={(v) => formatValue(v, fmt)} />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted)" }} iconType="circle" />
        </PieChart>
      </ChartFrame>
    </Panel>
  );
}

export function DataTable({ component, envelope }: Props<"DataTable">) {
  const rows = rowsOf(envelope, component.dataRef);
  return (
    <Panel title={component.title} className="overflow-hidden">
      <div className="-mx-5 -mb-5 overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <thead>
            <tr>
              {component.columns.map((c) => (
                <th
                  key={c.field}
                  scope="col"
                  className={`border-y border-line bg-surface-2 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted ${
                    c.format && NUMERIC.includes(c.format) ? "text-right" : ""
                  }`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="transition-colors hover:bg-surface-2/70">
                {component.columns.map((c, j) => (
                  <td
                    key={c.field}
                    className={`border-b border-line px-5 py-3 ${j === 0 ? "font-medium" : ""} ${
                      c.format && NUMERIC.includes(c.format) ? "text-right tabular-nums" : ""
                    }`}
                  >
                    {formatValue(row[c.field], c.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function Comparison({ component, envelope }: Props<"Comparison">) {
  const current = Number(resolveRef(envelope, component.currentRef));
  const previous = Number(resolveRef(envelope, component.previousRef));
  const diff = current - previous;
  const isRate = component.format === "percent";
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  const abs = Math.abs(diff);
  const change = isRate ? `${sign}${(abs * 100).toFixed(1)} pts` : `${sign}${formatValue(abs, component.format)}`;
  const relative = !isRate && previous !== 0 ? ` · ${diff > 0 ? "+" : diff < 0 ? "−" : ""}${Math.abs((diff / previous) * 100).toFixed(1)}%` : "";
  const good = component.higherIs === "good" ? diff > 0 : component.higherIs === "bad" ? diff < 0 : null;
  const tone =
    diff === 0 || good === null
      ? "bg-surface-2 text-muted"
      : good
        ? "bg-good/12 text-good"
        : "bg-bad/12 text-bad";
  const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "■";
  return (
    <section className="card p-5">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted">{component.title}</h3>
      <div className="mt-3 grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted">{component.previousLabel}</p>
          <p className="text-2xl font-semibold tabular-nums">{formatValue(previous, component.format)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">{component.currentLabel}</p>
          <p className="accent-ink text-2xl font-semibold tabular-nums">
            {formatValue(current, component.format)}
          </p>
        </div>
      </div>
      <p className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>
        <span aria-hidden="true">{arrow}</span>
        {change}
        {relative}
      </p>
    </section>
  );
}

export function FilterBar({
  component,
  values,
  onChange,
}: {
  component: Of<"FilterBar">;
  values: Record<string, string>;
  onChange?: (callKey: string, param: string, value: string) => void;
}) {
  return (
    <div className="card flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
        <FilterIcon width={15} height={15} />
        Refine
      </span>
      {component.filters.map((f) => {
        const id = `${component.id}-${f.callKey}-${f.param}`;
        return (
          <label key={id} htmlFor={id} className="flex items-center gap-2 text-sm">
            <span className="text-muted">{f.label}</span>
            <select
              id={id}
              value={values[`${f.callKey}.${f.param}`] ?? f.options[0].value}
              onChange={(e) => onChange?.(f.callKey, f.param, e.target.value)}
              className="focus-ring rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-sm font-medium"
            >
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}

export function Notice({ component }: Props<"Notice">) {
  const warning = component.level === "warning";
  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
        warning ? "border-warn/40 bg-warn/10 text-warn" : "border-accent/30 bg-accent/8 text-ink"
      }`}
    >
      <span className={`mt-0.5 shrink-0 ${warning ? "" : "text-accent"}`}>
        {warning ? <AlertIcon width={18} height={18} /> : <InfoIcon width={18} height={18} />}
      </span>
      <span>{component.text}</span>
    </div>
  );
}

export function EmptyState({ component }: Props<"EmptyState">) {
  return (
    <section className="card grid place-items-center px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2 text-muted">
        <InfoIcon width={22} height={22} />
      </span>
      <h3 className="mt-4 font-semibold">{component.title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{component.text}</p>
    </section>
  );
}
