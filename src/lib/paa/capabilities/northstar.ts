import { z } from "zod";
import { monthKey, monthLabel } from "../dates";
import { METRICS, defectRate, relativeChange } from "../data/metrics";
import {
  DATASET_VERSION,
  getNorthstarDataset,
  type DailyOutput,
  type ProductionLine,
} from "../data/seed";
import { NORTHSTAR_PERMISSIONS } from "../policies/roles";
import { ServiceInputError, type AuthorizedContext } from "../schemas/capability";
import { defineCapability } from "./define";

const date = z.iso.date();
const factoryId = z.string().regex(/^[a-z0-9-]{1,32}$/);

const rangeOk = (v: { dateFrom: string; dateTo: string }) => v.dateFrom <= v.dateTo;
const rangeMessage = { message: "dateFrom must not be after dateTo" };

/** Lines the caller may see: scoped by role (defence in depth) and by the optional factory filter. */
function visibleLines(context: AuthorizedContext, requestedFactory?: string): ProductionLine[] {
  const ds = getNorthstarDataset();
  if (requestedFactory && !ds.factories.some((f) => f.id === requestedFactory)) {
    throw new ServiceInputError("Unknown factory");
  }
  return ds.lines.filter(
    (l) =>
      (context.scope.factoryIds === "all" || context.scope.factoryIds.includes(l.factoryId)) &&
      (!requestedFactory || l.factoryId === requestedFactory),
  );
}

function dailyFor(lines: ProductionLine[], from: string, to: string): DailyOutput[] {
  const ids = new Set(lines.map((l) => l.id));
  return getNorthstarDataset().daily.filter((d) => ids.has(d.lineId) && d.date >= from && d.date <= to);
}

function sum(rows: DailyOutput[]): { produced: number; defective: number } {
  return rows.reduce(
    (acc, r) => ({ produced: acc.produced + r.unitsProduced, defective: acc.defective + r.unitsDefective }),
    { produced: 0, defective: 0 },
  );
}

// --- Production summary ---------------------------------------------------

const productionOutput = z.object({
  summary: z.object({ totalUnits: z.number(), totalDefective: z.number(), defectRate: z.number() }),
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
  description: "Units produced and defect rate for a date range, grouped by factory, production line or month.",
  explanation: "Totals daily output records for the chosen window and groups them. Defect rate is computed from units, never estimated.",
  requiredPermission: NORTHSTAR_PERMISSIONS.production,
  scopeField: "factoryId",
  datasetVersion: DATASET_VERSION,
  inputSchema: z
    .strictObject({
      dateFrom: date,
      dateTo: date,
      groupBy: z.enum(["factory", "line", "month"]),
      factoryId: factoryId.optional(),
    })
    .refine(rangeOk, rangeMessage),
  outputSchema: productionOutput,
  async execute(input, context) {
    const ds = getNorthstarDataset();
    const lines = visibleLines(context, input.factoryId);
    const rows = dailyFor(lines, input.dateFrom, input.dateTo);

    const groups = new Map<string, { label: string; rows: DailyOutput[] }>();
    const add = (key: string, label: string, row: DailyOutput) => {
      const g = groups.get(key) ?? { label, rows: [] };
      g.rows.push(row);
      groups.set(key, g);
    };
    for (const row of rows) {
      if (input.groupBy === "month") add(monthKey(row.date), monthLabel(monthKey(row.date)), row);
      else if (input.groupBy === "line") {
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
  summary: z.object({ overallDefectRate: z.number(), worstLineLabel: z.string(), worstLineRate: z.number() }),
  rows: z.array(
    z.object({
      lineId: z.string(),
      label: z.string(),
      factory: z.string(),
      unitsProduced: z.number(),
      unitsDefective: z.number(),
      defectRate: z.number(),
    }),
  ),
});

export const defectRates = defineCapability({
  id: "northstar.defect_rates",
  organizationId: "northstar",
  description: "Defect rate for every production line in a date range, ranked from highest to lowest.",
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

// --- Downtime breakdown ---------------------------------------------------

const downtimeOutput = z.object({
  summary: z.object({
    totalMinutes: z.number(),
    previousMinutes: z.number(),
    changeMinutes: z.number(),
    changePct: z.number(),
    topIncreaseCause: z.string(),
  }),
  rows: z.array(
    z.object({ cause: z.string(), minutes: z.number(), previousMinutes: z.number(), deltaMinutes: z.number() }),
  ),
});

export const downtimeBreakdown = defineCapability({
  id: "northstar.downtime_breakdown",
  organizationId: "northstar",
  description: "Downtime minutes by cause for one period compared with another, ranked by increase.",
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
