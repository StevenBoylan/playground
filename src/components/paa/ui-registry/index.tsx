"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart as RLineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatValue, type Format } from "@/lib/paa/format";
import { renderTemplate, resolveRef, type Envelope } from "@/lib/paa/schemas/bindings";
import type { ExperienceComponent } from "@/lib/paa/schemas/experience";

type Of<T extends ExperienceComponent["type"]> = Extract<ExperienceComponent, { type: T }>;
interface Props<T extends ExperienceComponent["type"]> {
  component: Of<T>;
  envelope: Envelope;
}

const PALETTE = ["#1d4ed8", "#0e7490", "#b45309", "#7c3aed", "#be123c", "#15803d"];
const CARD = "rounded-lg border border-neutral-300 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900";

function rowsOf(envelope: Envelope, ref: string): Record<string, unknown>[] {
  const value = resolveRef(envelope, ref);
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={CARD}>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function ChartFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="img" aria-label={`${label}. The same data is available in the table view where shown.`} className="h-72 w-full">
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
      <h2 className="text-2xl font-semibold">{component.text}</h2>
      {component.subtitle && <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{component.subtitle}</p>}
    </header>
  );
}

export function Narrative({ component, envelope }: Props<"Narrative">) {
  return <p className="text-base leading-relaxed">{renderTemplate(component.template, envelope)}</p>;
}

export function KpiCard({ component, envelope }: Props<"KpiCard">) {
  return (
    <section className={CARD}>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{component.title}</p>
      <p className="mt-1 text-3xl font-semibold" style={{ color: "var(--accent)" }}>
        {formatValue(resolveRef(envelope, component.dataRef), component.format)}
      </p>
    </section>
  );
}

export function LineChartView({ component, envelope }: Props<"LineChart">) {
  const data = rowsOf(envelope, component.dataRef);
  const fmt: Format = component.format ?? "number";
  return (
    <Card title={component.title}>
      <ChartFrame label={component.title}>
        <RLineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={component.xField} />
          <YAxis tickFormatter={(v) => formatValue(v, fmt)} width={70} />
          <Tooltip formatter={(v) => formatValue(v, fmt)} />
          <Line isAnimationActive={false} type="monotone" dataKey={component.yField} stroke="var(--accent)" strokeWidth={2} />
        </RLineChart>
      </ChartFrame>
    </Card>
  );
}

export function BarChartView({ component, envelope }: Props<"BarChart">) {
  const data = rowsOf(envelope, component.dataRef);
  const fmt: Format = component.format ?? "number";
  return (
    <Card title={component.title}>
      <ChartFrame label={component.title}>
        <RBarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={component.xField} interval={0} tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(v) => formatValue(v, fmt)} width={70} />
          <Tooltip formatter={(v) => formatValue(v, fmt)} />
          <Bar isAnimationActive={false} dataKey={component.yField} fill="var(--accent)" />
        </RBarChart>
      </ChartFrame>
    </Card>
  );
}

export function DonutChartView({ component, envelope }: Props<"DonutChart">) {
  const data = rowsOf(envelope, component.dataRef);
  const fmt: Format = component.format ?? "number";
  return (
    <Card title={component.title}>
      <ChartFrame label={component.title}>
        <PieChart>
          <Pie isAnimationActive={false} data={data} dataKey={component.valueField} nameKey={component.nameField} innerRadius="55%" outerRadius="80%">
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => formatValue(v, fmt)} />
          <Legend />
        </PieChart>
      </ChartFrame>
    </Card>
  );
}

export function DataTable({ component, envelope }: Props<"DataTable">) {
  const rows = rowsOf(envelope, component.dataRef);
  return (
    <Card title={component.title}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-300 dark:border-neutral-700">
              {component.columns.map((c) => (
                <th key={c.field} scope="col" className="py-2 pr-4 font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-neutral-200 last:border-0 dark:border-neutral-800">
                {component.columns.map((c) => (
                  <td key={c.field} className="py-2 pr-4">
                    {formatValue(row[c.field], c.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function Comparison({ component, envelope }: Props<"Comparison">) {
  const current = Number(resolveRef(envelope, component.currentRef));
  const previous = Number(resolveRef(envelope, component.previousRef));
  const diff = current - previous;
  const isRate = component.format === "percent";
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
  const abs = Math.abs(diff);
  const change = isRate ? `${sign}${(abs * 100).toFixed(1)} percentage points` : `${sign}${formatValue(abs, component.format)}`;
  const relative = !isRate && previous !== 0 ? ` (${diff > 0 ? "+" : diff < 0 ? "−" : ""}${Math.abs((diff / previous) * 100).toFixed(1)}%)` : "";
  const good = component.higherIs === "good" ? diff > 0 : component.higherIs === "bad" ? diff < 0 : null;
  const tone = diff === 0 || good === null ? "text-neutral-700 dark:text-neutral-300" : good ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400";
  const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "■";
  return (
    <Card title={component.title}>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{component.previousLabel}</p>
          <p className="text-2xl font-semibold">{formatValue(previous, component.format)}</p>
        </div>
        <div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{component.currentLabel}</p>
          <p className="text-2xl font-semibold" style={{ color: "var(--accent)" }}>
            {formatValue(current, component.format)}
          </p>
        </div>
      </div>
      <p className={`mt-3 text-sm font-medium ${tone}`}>
        <span aria-hidden="true">{arrow} </span>
        {change}
        {relative}
      </p>
    </Card>
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
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-dashed border-neutral-400 p-3 dark:border-neutral-600">
      {component.filters.map((f) => {
        const id = `${component.id}-${f.callKey}-${f.param}`;
        return (
          <label key={id} htmlFor={id} className="flex items-center gap-2 text-sm">
            {f.label}
            <select
              id={id}
              value={values[`${f.callKey}.${f.param}`] ?? f.options[0].value}
              onChange={(e) => onChange?.(f.callKey, f.param, e.target.value)}
              className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
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
  const tone =
    component.level === "warning"
      ? "border-amber-400 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-50"
      : "border-sky-400 bg-sky-50 text-sky-950 dark:bg-sky-950 dark:text-sky-50";
  return (
    <div role="status" className={`rounded-lg border p-3 text-sm ${tone}`}>
      {component.text}
    </div>
  );
}

export function EmptyState({ component }: Props<"EmptyState">) {
  return (
    <section className={`${CARD} text-center`}>
      <h3 className="font-semibold">{component.title}</h3>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{component.text}</p>
    </section>
  );
}
