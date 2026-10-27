import { z } from "zod";
import { monthKey, monthLabel, weekLabel, weekStart } from "../dates";
import { METRICS, defectRate, relativeChange } from "../data/metrics";
import {
  DATASET_VERSION,
  DOWNTIME_CAUSES,
  getNorthstarDataset,
  type DailyOutput,
  type DowntimeEvent,
  type ProductionLine,
} from "../data/seed";
import { NORTHSTAR_PERMISSIONS } from "../policies/roles";
import { ServiceInputError, type AuthorizedContext } from "../schemas/capability";
import { defineCapability } from "./define";

const date = z.iso.date().describe("YYYY-MM-DD");
const factoryId = z
  .string()
  .regex(/^[a-z0-9-]{1,32}$/)
  .describe("One of: dublin, gdansk, monterrey");
const lineId = z
  .string()
  .regex(/^[a-z0-9-]{1,32}$/)
  .describe("Line id such as gdansk-2 (factory id, hyphen, line number 1-3)");
const cause = z.enum(DOWNTIME_CAUSES);

const rangeOk = (v: { dateFrom: string; dateTo: string }) => v.dateFrom <= v.dateTo;
const rangeMessage = { message: "dateFrom must not be after dateTo" };

/** Lines the caller may see: scoped by role (defence in depth), then by the optional factory and line filters. */
function visibleLines(context: AuthorizedContext, requestedFactory?: string, requestedLine?: string): ProductionLine[] {
  const ds = getNorthstarDataset();
  if (requestedFactory && !ds.factories.some((f) => f.id === requestedFactory)) {
    throw new ServiceInputError("Unknown factory");
  }
  const lines = ds.lines.filter(
    (l) =>
      (context.scope.factoryIds === "all" || context.scope.factoryIds.includes(l.factoryId)) &&
      (!requestedFactory || l.factoryId === requestedFactory),
  );
  if (!requestedLine) return lines;
  const match = lines.filter((l) => l.id === requestedLine);
  if (match.length === 0) throw new ServiceInputError("Unknown line");
  return match;
}

function dailyFor(lines: ProductionLine[], from: string, to: string): DailyOutput[] {
  const ids = new Set(lines.map((l) => l.id));
  return getNorthstarDataset().daily.filter((d) => ids.has(d.lineId) && d.date >= from && d.date <= to);
}

function downtimeFor(lines: ProductionLine[], from: string, to: string, onlyCause?: string): DowntimeEvent[] {
  const ids = new Set(lines.map((l) => l.id));
  return getNorthstarDataset().downtime.filter(
    (e) => ids.has(e.lineId) && e.date >= from && e.date <= to && (!onlyCause || e.cause === onlyCause),
  );
}

function sum(rows: DailyOutput[]): { produced: number; defective: number } {
  return rows.reduce(
    (acc, r) => ({ produced: acc.produced + r.unitsProduced, defective: acc.defective + r.unitsDefective }),
    { produced: 0, defective: 0 },
  );
}

function periodOf(day: string, granularity: "week" | "month"): { key: string; label: string } {
  if (granularity === "month") return { key: monthKey(day), label: monthLabel(monthKey(day)) };
  const start = weekStart(day);
  return { key: start, label: `Week of ${weekLabel(start)}` };
}

// --- Production summary ---------------------------------------------------

const productionOutput = z.object({
  summary: z.object({
    totalUnits: z.number().describe("Units produced in the window"),
    totalDefective: z.number(),
    defectRate: z.number().describe("Fraction, e.g. 0.012 for 1.2%"),
  }),
  rows: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      unitsProduced: z.number(),
      unitsDefective: z.number(),
      defectRate: z.number(),
    }),
  ),
});

export const productionSummary = defineCapability({
  id: "northstar.production_summary",
  organizationId: "northstar",
  description:
    "Units produced and defect rate for a date range, grouped by factory, production line, week or month. Use for output volumes and comparisons between factories or lines.",
  explanation: "Totals daily output records for the chosen window and groups them. Defect rate is computed from units, never estimated.",
  requiredPermission: NORTHSTAR_PERMISSIONS.production,
  scopeField: "factoryId",
  datasetVersion: DATASET_VERSION,
  inputSchema: z
    .strictObject({
      dateFrom: date,
      dateTo: date,
      groupBy: z.enum(["factory", "line", "week", "month"]),
      factoryId: factoryId.optional(),
      lineId: lineId.optional(),
    })
    .refine(rangeOk, rangeMessage),
  outputSchema: productionOutput,
  async execute(input, context) {
    const ds = getNorthstarDataset();
    const lines = visibleLines(context, input.factoryId, input.lineId);
    const rows = dailyFor(lines, input.dateFrom, input.dateTo);

    const groups = new Map<string, { label: string; rows: DailyOutput[] }>();
    const add = (key: string, label: string, row: DailyOutput) => {
      const g = groups.get(key) ?? { label, rows: [] };
      g.rows.push(row);
      groups.set(key, g);
    };
    for (const row of rows) {
      if (input.groupBy === "month" || input.groupBy === "week") {
        const p = periodOf(row.date, input.groupBy);
        add(p.key, p.label, row);
      } else if (input.groupBy === "line") {
        add(row.lineId, ds.lines.find((l) => l.id === row.lineId)?.name ?? row.lineId, row);
      } else {
        const factory = ds.factories.find((f) => f.id === lines.find((l) => l.id === row.lineId)?.factoryId);
        if (factory) add(factory.id, factory.name, row);
      }
    }

    const total = sum(rows);
    return {
      data: {
        summary: { totalUnits: total.produced, totalDefective: total.defective, defectRate: defectRate(total.defective, total.produced) },
        rows: [...groups.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, g]) => {
            const s = sum(g.rows);
            return {
              key,
              label: g.label,
              unitsProduced: s.produced,
              unitsDefective: s.defective,
              defectRate: defectRate(s.defective, s.produced),
            };
          }),
      },
      metricDefinitions: [METRICS.unitsProduced, METRICS.defectRate],
      timeRange: { from: input.dateFrom, to: input.dateTo },
    };
  },
});

// --- Defect rates by line -------------------------------------------------

const defectOutput = z.object({
  summary: z.object({
    overallDefectRate: z.number().describe("Fraction"),
    worstLineLabel: z.string(),
    worstLineRate: z.number().describe("Fraction"),
  }),
  rows: z
    .array(
      z.object({
        lineId: z.string(),
        label: z.string(),
        factory: z.string(),
        unitsProduced: z.number(),
        unitsDefective: z.number(),
        defectRate: z.number().describe("Fraction"),
      }),
    )
    .describe("Sorted by defectRate, highest first"),
});

export const defectRates = defineCapability({
  id: "northstar.defect_rates",
  organizationId: "northstar",
  description: "Defect rate for every production line in a date range, ranked from highest to lowest. Use to find the worst or best lines.",
  explanation: "Computes defective units ÷ units produced per line and ranks the lines.",
  requiredPermission: NORTHSTAR_PERMISSIONS.defects,
  scopeField: "factoryId",
  datasetVersion: DATASET_VERSION,
  inputSchema: z
    .strictObject({ dateFrom: date, dateTo: date, factoryId: factoryId.optional() })
    .refine(rangeOk, rangeMessage),
  outputSchema: defectOutput,
  async execute(input, context) {
    const ds = getNorthstarDataset();
    const lines = visibleLines(context, input.factoryId);
    const rows = lines
      .map((line) => {
        const s = sum(dailyFor([line], input.dateFrom, input.dateTo));
        return {
          lineId: line.id,
          label: line.name,
          factory: ds.factories.find((f) => f.id === line.factoryId)?.name ?? line.factoryId,
          unitsProduced: s.produced,
          unitsDefective: s.defective,
          defectRate: defectRate(s.defective, s.produced),
        };
      })
      .sort((a, b) => b.defectRate - a.defectRate);

    const total = sum(dailyFor(lines, input.dateFrom, input.dateTo));
    return {
      data: {
        summary: {
          overallDefectRate: defectRate(total.defective, total.produced),
          worstLineLabel: rows[0]?.label ?? "none",
          worstLineRate: rows[0]?.defectRate ?? 0,
        },
        rows,
      },
      metricDefinitions: [METRICS.defectRate],
      timeRange: { from: input.dateFrom, to: input.dateTo },
    };
  },
});

// --- Defect trend ---------------------------------------------------------

const defectTrendOutput = z.object({
  summary: z.object({
    overallDefectRate: z.number().describe("Fraction"),
    firstPeriodRate: z.number().describe("Fraction in the first period"),
    lastPeriodRate: z.number().describe("Fraction in the last period"),
    changeInRate: z.number().describe("lastPeriodRate minus firstPeriodRate, as a fraction"),
  }),
  rows: z
    .array(
      z.object({
        period: z.string(),
        label: z.string(),
        unitsProduced: z.number(),
        unitsDefective: z.number(),
        defectRate: z.number().describe("Fraction"),
      }),
    )
    .describe("Chronological"),
});

export const defectTrend = defineCapability({
  id: "northstar.defect_trend",
  organizationId: "northstar",
  description:
    "Defect rate over time (weekly or monthly) for all lines, one factory, or one line. Use for 'how has quality changed' questions.",
  explanation: "Groups daily output by week or month and computes defective units ÷ units produced for each period.",
  requiredPermission: NORTHSTAR_PERMISSIONS.defects,
  scopeField: "factoryId",
  datasetVersion: DATASET_VERSION,
  inputSchema: z
    .strictObject({
      dateFrom: date,
      dateTo: date,
      granularity: z.enum(["week", "month"]),
      factoryId: factoryId.optional(),
      lineId: lineId.optional(),
    })
    .refine(rangeOk, rangeMessage),
  outputSchema: defectTrendOutput,
  async execute(input, context) {
    const lines = visibleLines(context, input.factoryId, input.lineId);
    const rows = dailyFor(lines, input.dateFrom, input.dateTo);
    const groups = new Map<string, { label: string; rows: DailyOutput[] }>();
    for (const row of rows) {
      const p = periodOf(row.date, input.granularity);
      const g = groups.get(p.key) ?? { label: p.label, rows: [] };
      g.rows.push(row);
      groups.set(p.key, g);
    }
    const periods = [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, g]) => {
        const s = sum(g.rows);
        return { period, label: g.label, unitsProduced: s.produced, unitsDefective: s.defective, defectRate: defectRate(s.defective, s.produced) };
      });
    const total = sum(rows);
    const first = periods[0]?.defectRate ?? 0;
    const last = periods.at(-1)?.defectRate ?? 0;
    return {
      data: {
        summary: {
          overallDefectRate: defectRate(total.defective, total.produced),
          firstPeriodRate: first,
          lastPeriodRate: last,
          changeInRate: last - first,
        },
        rows: periods,
      },
      metricDefinitions: [METRICS.defectRate],
      timeRange: { from: input.dateFrom, to: input.dateTo },
    };
  },
});

// --- Downtime breakdown (period comparison) -------------------------------

const downtimeOutput = z.object({
  summary: z.object({
    totalMinutes: z.number(),
    previousMinutes: z.number(),
    changeMinutes: z.number(),
    changePct: z.number().describe("Fraction change versus the comparison period"),
    topIncreaseCause: z.string(),
  }),
  rows: z
    .array(z.object({ cause: z.string(), minutes: z.number(), previousMinutes: z.number(), deltaMinutes: z.number() }))
    .describe("Sorted by deltaMinutes, largest increase first"),
});

export const downtimeBreakdown = defineCapability({
  id: "northstar.downtime_breakdown",
  organizationId: "northstar",
  description: "Downtime minutes by cause for one period compared with another, ranked by increase. Use for period-over-period downtime questions.",
  explanation: "Sums recorded downtime events by cause in both periods and ranks causes by how much they grew.",
  requiredPermission: NORTHSTAR_PERMISSIONS.downtime,
  scopeField: "factoryId",
  datasetVersion: DATASET_VERSION,
  inputSchema: z
    .strictObject({
      dateFrom: date,
      dateTo: date,
      compareFrom: date,
      compareTo: date,
      factoryId: factoryId.optional(),
    })
    .refine((v) => v.dateFrom <= v.dateTo && v.compareFrom <= v.compareTo, {
      message: "a range start must not be after its end",
    }),
  outputSchema: downtimeOutput,
  async execute(input, context) {
    const lines = new Set(visibleLines(context, input.factoryId).map((l) => l.id));
    const events = getNorthstarDataset().downtime.filter((e) => lines.has(e.lineId));

    const byCause = new Map<string, { current: number; previous: number }>();
    for (const e of events) {
      const inCurrent = e.date >= input.dateFrom && e.date <= input.dateTo;
      const inPrevious = e.date >= input.compareFrom && e.date <= input.compareTo;
      if (!inCurrent && !inPrevious) continue;
      const entry = byCause.get(e.cause) ?? { current: 0, previous: 0 };
      if (inCurrent) entry.current += e.minutes;
      if (inPrevious) entry.previous += e.minutes;
      byCause.set(e.cause, entry);
    }

    const rows = [...byCause.entries()]
      .map(([cause, v]) => ({
        cause,
        minutes: v.current,
        previousMinutes: v.previous,
        deltaMinutes: v.current - v.previous,
      }))
      .sort((a, b) => b.deltaMinutes - a.deltaMinutes);

    const totalMinutes = rows.reduce((a, r) => a + r.minutes, 0);
    const previousMinutes = rows.reduce((a, r) => a + r.previousMinutes, 0);
    return {
      data: {
        summary: {
          totalMinutes,
          previousMinutes,
          changeMinutes: totalMinutes - previousMinutes,
          changePct: relativeChange(totalMinutes, previousMinutes),
          topIncreaseCause: rows[0]?.cause ?? "none",
        },
        rows,
      },
      metricDefinitions: [METRICS.downtimeMinutes],
      timeRange: { from: input.dateFrom, to: input.dateTo },
    };
  },
});

// --- Downtime by location -------------------------------------------------

const downtimeLocationOutput = z.object({
  summary: z.object({ totalMinutes: z.number(), topLabel: z.string(), topMinutes: z.number() }),
  rows: z
    .array(z.object({ key: z.string(), label: z.string(), minutes: z.number(), events: z.number() }))
    .describe("Sorted by minutes, highest first"),
});

export const downtimeByLocation = defineCapability({
  id: "northstar.downtime_by_location",
  organizationId: "northstar",
  description:
    "Downtime minutes and event counts by production line or by factory, optionally for a single cause. Use to find where downtime is concentrated.",
  explanation: "Sums recorded downtime events per line or factory, optionally restricted to one cause.",
  requiredPermission: NORTHSTAR_PERMISSIONS.downtime,
  scopeField: "factoryId",
  datasetVersion: DATASET_VERSION,
  inputSchema: z
    .strictObject({
      dateFrom: date,
      dateTo: date,
      groupBy: z.enum(["line", "factory"]),
      cause: cause.optional(),
      factoryId: factoryId.optional(),
    })
    .refine(rangeOk, rangeMessage),
  outputSchema: downtimeLocationOutput,
  async execute(input, context) {
    const ds = getNorthstarDataset();
    const lines = visibleLines(context, input.factoryId);
    const events = downtimeFor(lines, input.dateFrom, input.dateTo, input.cause);
    const groups = new Map<string, { label: string; minutes: number; events: number }>();
    for (const e of events) {
      const line = ds.lines.find((l) => l.id === e.lineId);
      if (!line) continue;
      const key = input.groupBy === "line" ? line.id : line.factoryId;
      const label =
        input.groupBy === "line" ? line.name : (ds.factories.find((f) => f.id === line.factoryId)?.name ?? line.factoryId);
      const g = groups.get(key) ?? { label, minutes: 0, events: 0 };
      g.minutes += e.minutes;
      g.events += 1;
      groups.set(key, g);
    }
    const rows = [...groups.entries()]
      .map(([key, g]) => ({ key, label: g.label, minutes: g.minutes, events: g.events }))
      .sort((a, b) => b.minutes - a.minutes);
    return {
      data: {
        summary: {
          totalMinutes: rows.reduce((a, r) => a + r.minutes, 0),
          topLabel: rows[0]?.label ?? "none",
          topMinutes: rows[0]?.minutes ?? 0,
        },
        rows,
      },
      metricDefinitions: [METRICS.downtimeMinutes],
      timeRange: { from: input.dateFrom, to: input.dateTo },
    };
  },
});

// --- Downtime trend -------------------------------------------------------

const downtimeTrendOutput = z.object({
  summary: z.object({ totalMinutes: z.number(), peakLabel: z.string(), peakMinutes: z.number() }),
  rows: z.array(z.object({ period: z.string(), label: z.string(), minutes: z.number(), events: z.number() })).describe("Chronological"),
});

export const downtimeTrend = defineCapability({
  id: "northstar.downtime_trend",
  organizationId: "northstar",
  description:
    "Downtime minutes over time (weekly or monthly) for all lines, one factory or one line, optionally for a single cause. Use for 'how has downtime changed' questions.",
  explanation: "Groups recorded downtime events by week or month and sums their minutes.",
  requiredPermission: NORTHSTAR_PERMISSIONS.downtime,
  scopeField: "factoryId",
  datasetVersion: DATASET_VERSION,
  inputSchema: z
    .strictObject({
      dateFrom: date,
      dateTo: date,
      granularity: z.enum(["week", "month"]),
      cause: cause.optional(),
      factoryId: factoryId.optional(),
      lineId: lineId.optional(),
    })
    .refine(rangeOk, rangeMessage),
  outputSchema: downtimeTrendOutput,
  async execute(input, context) {
    const lines = visibleLines(context, input.factoryId, input.lineId);
    const events = downtimeFor(lines, input.dateFrom, input.dateTo, input.cause);
    const groups = new Map<string, { label: string; minutes: number; events: number }>();
    for (const e of events) {
      const p = periodOf(e.date, input.granularity);
      const g = groups.get(p.key) ?? { label: p.label, minutes: 0, events: 0 };
      g.minutes += e.minutes;
      g.events += 1;
      groups.set(p.key, g);
    }
    const rows = [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, g]) => ({ period, label: g.label, minutes: g.minutes, events: g.events }));
    const peak = rows.reduce<(typeof rows)[number] | undefined>((best, r) => (!best || r.minutes > best.minutes ? r : best), undefined);
    return {
      data: {
        summary: {
          totalMinutes: rows.reduce((a, r) => a + r.minutes, 0),
          peakLabel: peak?.label ?? "none",
          peakMinutes: peak?.minutes ?? 0,
        },
        rows,
      },
      metricDefinitions: [METRICS.downtimeMinutes],
      timeRange: { from: input.dateFrom, to: input.dateTo },
    };
  },
});
