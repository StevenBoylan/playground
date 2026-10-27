"use client";

import type { Envelope } from "@/lib/paa/schemas/bindings";
import type { ExperienceComponent, ExperienceSpec } from "@/lib/paa/schemas/experience";
import {
  BarChartView,
  Comparison,
  DataTable,
  DonutChartView,
  EmptyState,
  FilterBar,
  KpiCard,
  LineChartView,
  Narrative,
  Notice,
  PageHeading,
} from "./ui-registry";

export interface FilterState {
  values: Record<string, string>;
  onChange?: (callKey: string, param: string, value: string) => void;
}

function View({ component, envelope, filters }: { component: ExperienceComponent; envelope: Envelope; filters: FilterState }) {
  switch (component.type) {
    case "PageHeading":
      return <PageHeading component={component} envelope={envelope} />;
    case "Narrative":
      return <Narrative component={component} envelope={envelope} />;
    case "KpiCard":
      return <KpiCard component={component} envelope={envelope} />;
    case "Comparison":
      return <Comparison component={component} envelope={envelope} />;
    case "LineChart":
      return <LineChartView component={component} envelope={envelope} />;
    case "BarChart":
      return <BarChartView component={component} envelope={envelope} />;
    case "DonutChart":
      return <DonutChartView component={component} envelope={envelope} />;
    case "DataTable":
      return <DataTable component={component} envelope={envelope} />;
    case "FilterBar":
      return <FilterBar component={component} values={filters.values} onChange={filters.onChange} />;
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
export function DynamicRenderer({
  experience,
  envelope,
  filters = { values: {} },
}: {
  experience: ExperienceSpec;
  envelope: Envelope;
  filters?: FilterState;
}) {
  // Consecutive KPI cards and comparisons sit side by side; everything else stacks.
  const out: React.ReactNode[] = [];
  let group: ExperienceComponent[] = [];
  const flush = () => {
    if (group.length === 0) return;
    out.push(
      <div key={`group-${group[0].id}`} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {group.map((c) => (
          <View key={c.id} component={c} envelope={envelope} filters={filters} />
        ))}
      </div>,
    );
    group = [];
  };
  for (const c of experience.components) {
    if (c.type === "KpiCard" || c.type === "Comparison") group.push(c);
    else {
      flush();
      out.push(<View key={c.id} component={c} envelope={envelope} filters={filters} />);
    }
  }
  flush();
  return <div className="grid gap-6">{out}</div>;
}
