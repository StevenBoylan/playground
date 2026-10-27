import type { MetricDefinition } from "../schemas/capability";

/** Defect rate = defective units ÷ units produced, as a fraction (0.012 = 1.2%). */
export function defectRate(defective: number, produced: number): number {
  return produced === 0 ? 0 : defective / produced;
}

/** Relative change from a previous value, as a fraction. Zero when there is no baseline. */
export function relativeChange(current: number, previous: number): number {
  return previous === 0 ? 0 : (current - previous) / previous;
}

export const METRICS: Record<"unitsProduced" | "defectRate" | "downtimeMinutes", MetricDefinition> = {
  unitsProduced: {
    name: "Units produced",
    formula: "Sum of units produced by the selected lines on the selected days (Sundays are not scheduled)",
    unit: "units",
  },
  defectRate: {
    name: "Defect rate",
    formula: "Defective units ÷ units produced",
    unit: "% of units produced",
  },
  downtimeMinutes: {
    name: "Downtime",
    formula: "Sum of minutes across recorded downtime events",
    unit: "minutes",
  },
};
