"use client";

import type { Envelope } from "@/lib/paa/schemas/bindings";
import type { ExperienceComponent, ExperienceSpec } from "@/lib/paa/schemas/experience";
import {
  BarChartView,
  DataTable,
  DonutChartView,
  EmptyState,
  KpiCard,
  LineChartView,
  Narrative,
  Notice,
  PageHeading,
} from "./ui-registry";

function View({ component, envelope }: { component: ExperienceComponent; envelope: Envelope }) {
  switch (component.type) {
    case "PageHeading":
      return <PageHeading component={component} envelope={envelope} />;
    case "Narrative":
      return <Narrative component={component} envelope={envelope} />;
    case "KpiCard":
      return <KpiCard component={component} envelope={envelope} />;
    case "LineChart":
      return <LineChartView component={component} envelope={envelope} />;
    case "BarChart":
      return <BarChartView component={component} envelope={envelope} />;
    case "DonutChart":
      return <DonutChartView component={component} envelope={envelope} />;
    case "DataTable":
      return <DataTable component={component} envelope={envelope} />;
    case "Notice":
      return <Notice component={component} envelope={envelope} />;
    case "EmptyState":
      return <EmptyState component={component} envelope={envelope} />;
  }
}

/**
 * Renders an already-validated UI specification. Only allowlisted components exist,
 * and all values are resolved from the server-approved envelope.
 */
export function DynamicRenderer({ experience, envelope }: { experience: ExperienceSpec; envelope: Envelope }) {
  // KPI cards sit side by side; everything else stacks.
  const out: React.ReactNode[] = [];
  let kpis: ExperienceComponent[] = [];
  const flush = () => {
    if (kpis.length === 0) return;
    out.push(
      <div key={`kpis-${kpis[0].id}`} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((c) => (
          <View key={c.id} component={c} envelope={envelope} />
        ))}
      </div>,
    );
    kpis = [];
  };
  for (const c of experience.components) {
    if (c.type === "KpiCard") kpis.push(c);
    else {
      flush();
      out.push(<View key={c.id} component={c} envelope={envelope} />);
    }
  }
  flush();
  return <div className="grid gap-6">{out}</div>;
}
