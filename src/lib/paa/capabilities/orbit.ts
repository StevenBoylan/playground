import { z } from "zod";
import { monthLabel, quarterKey, quarterLabel } from "../dates";
import {
  FEATURES,
  ORBIT_DATASET_VERSION,
  PLANS,
  SEGMENTS,
  getOrbitDataset,
  monthRange,
  type AccountMonth,
  type TicketCategory,
} from "../data/orbit-seed";
import { ORBIT_PERMISSIONS } from "../policies/roles";
import type { AuthorizedContext, MetricDefinition } from "../schemas/capability";
import { defineCapability } from "./define";

const ORG = "orbit";
const date = z.iso.date().describe("YYYY-MM-DD. Orbit's data is monthly, so a range selects whole months");
const planId = z.enum(PLANS.map((p) => p.id) as [string, ...string[]]).describe("starter, growth, scale or enterprise");
const segment = z.enum(SEGMENTS.map((s) => s.id) as [string, ...string[]]).describe("smb, mid-market or enterprise");
const feature = z.enum(FEATURES.map((f) => f.id) as [string, ...string[]]).describe("dashboards, reports, alerts, api, integrations, sso or mobile");
const category = z.enum(["how-to", "bug", "billing", "feature-request", "outage"]);

const rangeOk = (v: { dateFrom: string; dateTo: string }) => v.dateFrom <= v.dateTo;
const rangeMessage = { message: "dateFrom must not be after dateTo" };

const METRICS: Record<string, MetricDefinition> = {
  mrr: { name: "MRR", formula: "Sum of monthly recurring revenue across customers at the end of the month", unit: "EUR per month" },
  churnRate: {
    name: "Churn rate",
    formula: "Customers lost ÷ customer-months at risk (customers present at the start of each month): the average monthly rate",
    unit: "% of customers per month",
  },
  ticketsPerAccount: { name: "Tickets per account", formula: "Support tickets ÷ customer-months", unit: "tickets per customer per month" },
  adoption: {
    name: "Feature adoption",
    formula: "Customers using a feature ÷ customers, averaged over the selected features and months",
    unit: "% of customers",
  },
};

const sees = (ctx: AuthorizedContext, permission: string) => ctx.permissions.includes(permission);

function period(month: string, granularity: "month" | "quarter"): { key: string; label: string } {
  if (granularity === "month") return { key: month, label: monthLabel(month) };
  const key = quarterKey(`${month}-01`);
  return { key, label: quarterLabel(key) };
}

function rowsIn(from: string, to: string, filter: { planId?: string; segment?: string }): AccountMonth[] {
  const months = new Set(monthRange(from, to));
  return getOrbitDataset().accountMonths.filter(
    (r) => months.has(r.month) && (!filter.planId || r.planId === filter.planId) && (!filter.segment || r.segment === filter.segment),
  );
}

const planName = (id: string) => PLANS.find((p) => p.id === id)?.name ?? id;
const segmentName = (id: string) => SEGMENTS.find((s) => s.id === id)?.name ?? id;
const featureName = (id: string) => FEATURES.find((f) => f.id === id)?.name ?? id;
const ratio = (a: number, b: number) => (b === 0 ? 0 : a / b);
const prevMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

// --- MRR trend ------------------------------------------------------------

const mrrTrendOutput = z.object({
  summary: z.object({
    currentMrr: z.number().describe("MRR in the last month of the window, in euros"),
    startMrr: z.number().describe("MRR at the end of the month before the window"),
    growthPct: z.number().describe("Fraction: currentMrr against startMrr"),
    activeCustomers: z.number(),
    annualRunRate: z.number().describe("currentMrr x 12"),
  }),
  rows: z
    .array(
      z.object({
        period: z.string(),
        label: z.string(),
        mrr: z.number(),
        newMrr: z.number(),
        expansionMrr: z.number(),
        churnedMrr: z.number(),
        netNewMrr: z.number(),
        activeCustomers: z.number(),
      }),
    )
    .describe("Chronological"),
});

export const mrrTrend = defineCapability({
  id: "orbit.mrr_trend",
  organizationId: ORG,
  description: "Monthly recurring revenue over time (by month or quarter), with new, expansion and churned revenue. Use for revenue growth questions.",
  explanation: "Rebuilds each month's revenue from the customer records and splits movement into new, expansion and churned MRR.",
  requiredPermission: ORBIT_PERMISSIONS.revenue,
  datasetVersion: ORBIT_DATASET_VERSION,
  inputSchema: z
    .strictObject({ dateFrom: date, dateTo: date, granularity: z.enum(["month", "quarter"]), planId: planId.optional(), segment: segment.optional() })
    .refine(rangeOk, rangeMessage),
  outputSchema: mrrTrendOutput,
  async execute(input) {
    const rows = rowsIn(input.dateFrom, input.dateTo, input);
    const byMonth = new Map<string, { mrr: number; added: number; expansion: number; churned: number; active: number }>();
    for (const r of rows) {
      const m = byMonth.get(r.month) ?? { mrr: 0, added: 0, expansion: 0, churned: 0, active: 0 };
      m.mrr += r.mrrEnd;
      if (r.isNew) m.added += r.mrrEnd;
      else if (r.churned) m.churned += r.mrrStart;
      else m.expansion += r.mrrEnd - r.mrrStart;
      if (!r.churned) m.active += 1;
      byMonth.set(r.month, m);
    }

    const groups = new Map<string, { label: string; months: string[] }>();
    for (const month of [...byMonth.keys()].sort()) {
      const p = period(month, input.granularity);
      const g = groups.get(p.key) ?? { label: p.label, months: [] };
      g.months.push(month);
      groups.set(p.key, g);
    }
    const out = [...groups.entries()].map(([key, g]) => {
      const last = byMonth.get(g.months.at(-1)!)!;
      const sum = (f: (m: { added: number; expansion: number; churned: number }) => number) => g.months.reduce((a, m) => a + f(byMonth.get(m)!), 0);
      const added = sum((m) => m.added);
      const expansion = sum((m) => m.expansion);
      const churned = sum((m) => m.churned);
      return { period: key, label: g.label, mrr: last.mrr, newMrr: added, expansionMrr: expansion, churnedMrr: churned, netNewMrr: added + expansion - churned, activeCustomers: last.active };
    });

    const first = [...byMonth.keys()].sort()[0];
    const before = first ? rowsIn(prevMonth(first), prevMonth(first), input).reduce((a, r) => a + r.mrrEnd, 0) : 0;
    const current = out.at(-1)?.mrr ?? 0;
    return {
      data: {
        summary: { currentMrr: current, startMrr: before, growthPct: before === 0 ? 0 : current / before - 1, activeCustomers: out.at(-1)?.activeCustomers ?? 0, annualRunRate: current * 12 },
        rows: out,
      },
      metricDefinitions: [METRICS.mrr],
      timeRange: { from: input.dateFrom, to: input.dateTo },
    };
  },
});

// --- Revenue mix ----------------------------------------------------------

const mixOutput = z.object({
  summary: z.object({ totalMrr: z.number(), topLabel: z.string(), topShare: z.number().describe("Fraction") }),
  rows: z
    .array(z.object({ key: z.string(), label: z.string(), mrr: z.number(), customers: z.number(), share: z.number().describe("Fraction of total MRR"), mrrPerCustomer: z.number() }))
    .describe("Largest first"),
});

export const revenueMix = defineCapability({
  id: "orbit.revenue_mix",
  organizationId: ORG,
  description: "Where revenue comes from on a given date: MRR, customers and share by plan or by segment. Use for revenue breakdowns.",
  explanation: "Takes the month-end snapshot containing the date and groups MRR by plan or segment.",
  requiredPermission: ORBIT_PERMISSIONS.revenue,
  datasetVersion: ORBIT_DATASET_VERSION,
  inputSchema: z.strictObject({ asOf: date, groupBy: z.enum(["plan", "segment"]) }),
  outputSchema: mixOutput,
  async execute(input) {
    const month = input.asOf.slice(0, 7);
    const rows = rowsIn(month, month, {}).filter((r) => !r.churned);
    const groups = new Map<string, { label: string; mrr: number; customers: number }>();
    for (const r of rows) {
      const key = input.groupBy === "plan" ? r.planId : r.segment;
      const g = groups.get(key) ?? { label: input.groupBy === "plan" ? planName(key) : segmentName(key), mrr: 0, customers: 0 };
      g.mrr += r.mrrEnd;
      g.customers += 1;
      groups.set(key, g);
    }
    const total = rows.reduce((a, r) => a + r.mrrEnd, 0);
    const out = [...groups.entries()]
      .map(([key, g]) => ({ key, label: g.label, mrr: g.mrr, customers: g.customers, share: ratio(g.mrr, total), mrrPerCustomer: Math.round(ratio(g.mrr, g.customers)) }))
      .sort((a, b) => b.mrr - a.mrr);
    return {
      data: { summary: { totalMrr: total, topLabel: out[0]?.label ?? "none", topShare: out[0]?.share ?? 0 }, rows: out },
      metricDefinitions: [METRICS.mrr],
      timeRange: { from: `${month}-01`, to: input.asOf },
    };
  },
});

// --- Churn ----------------------------------------------------------------

const churnOutput = z.object({
  summary: z.object({
    churnedCustomers: z.number(),
    churnRate: z.number().describe("Average monthly churn rate, as a fraction"),
    churnedMrr: z.number().nullable().describe("null when the caller's role may not see revenue"),
    highestLabel: z.string(),
    highestRate: z.number().describe("Fraction"),
  }),
  rows: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        churnedCustomers: z.number(),
        customerMonths: z.number(),
        churnRate: z.number().describe("Average monthly churn rate, as a fraction"),
        churnedMrr: z.number().nullable().describe("null when the caller's role may not see revenue"),
      }),
    )
    .describe("Highest churn rate first, except by month/quarter which are chronological"),
});

export const churn = defineCapability({
  id: "orbit.churn",
  organizationId: ORG,
  description:
    "Customer churn for a date range, grouped by plan, segment, month, quarter or reason. Revenue lost is included only for roles that may see revenue.",
  explanation: "Counts customers who left against the customer-months at risk, so different groupings are comparable.",
  requiredPermission: ORBIT_PERMISSIONS.churn,
  datasetVersion: ORBIT_DATASET_VERSION,
  inputSchema: z
    .strictObject({
      dateFrom: date,
      dateTo: date,
      groupBy: z.enum(["plan", "segment", "month", "quarter", "reason"]),
      planId: planId.optional(),
      segment: segment.optional(),
    })
    .refine(rangeOk, rangeMessage),
  outputSchema: churnOutput,
  async execute(input, ctx) {
    const showRevenue = sees(ctx, ORBIT_PERMISSIONS.revenue);
    const months = new Set(monthRange(input.dateFrom, input.dateTo));
    const ds = getOrbitDataset();
    const exposed = rowsIn(input.dateFrom, input.dateTo, input).filter((r) => !r.isNew);
    const events = ds.churn.filter(
      (e) => months.has(e.month) && (!input.planId || e.planId === input.planId) && (!input.segment || e.segment === input.segment),
    );
    const totalExposure = exposed.length;

    const keyOf = (month: string, plan: string, seg: string, reason?: string) =>
      input.groupBy === "plan"
        ? { key: plan, label: planName(plan) }
        : input.groupBy === "segment"
          ? { key: seg, label: segmentName(seg) }
          : input.groupBy === "reason"
            ? { key: reason ?? "", label: reason ?? "" }
            : period(month, input.groupBy);

    const groups = new Map<string, { label: string; churned: number; exposure: number; mrr: number }>();
    const touch = (k: { key: string; label: string }) => {
      const g = groups.get(k.key) ?? { label: k.label, churned: 0, exposure: 0, mrr: 0 };
      groups.set(k.key, g);
      return g;
    };
    for (const r of exposed) if (input.groupBy !== "reason") touch(keyOf(r.month, r.planId, r.segment)).exposure += 1;
    for (const e of events) {
      const g = touch(keyOf(e.month, e.planId, e.segment, e.reason));
      g.churned += 1;
      g.mrr += e.mrrLost;
    }

    const chronological = input.groupBy === "month" || input.groupBy === "quarter";
    const rows = [...groups.entries()]
      .map(([key, g]) => {
        const denominator = input.groupBy === "reason" ? totalExposure : g.exposure;
        return { key, label: g.label, churnedCustomers: g.churned, customerMonths: denominator, churnRate: ratio(g.churned, denominator), churnedMrr: showRevenue ? g.mrr : null };
      })
      .sort((a, b) => (chronological ? a.key.localeCompare(b.key) : b.churnRate - a.churnRate));
    const highest = [...rows].sort((a, b) => b.churnRate - a.churnRate)[0];
    return {
      data: {
        summary: {
          churnedCustomers: events.length,
          churnRate: ratio(events.length, totalExposure),
          churnedMrr: showRevenue ? events.reduce((a, e) => a + e.mrrLost, 0) : null,
          highestLabel: highest?.label ?? "none",
          highestRate: highest?.churnRate ?? 0,
        },
        rows,
      },
      metricDefinitions: [METRICS.churnRate, ...(showRevenue ? [METRICS.mrr] : [])],
      timeRange: { from: input.dateFrom, to: input.dateTo },
      disclosures: showRevenue ? undefined : ["Revenue lost to churn is hidden for this role"],
    };
  },
});

// --- Support load ---------------------------------------------------------

const supportOutput = z.object({
  summary: z.object({
    totalTickets: z.number(),
    ticketsPerCustomer: z.number().describe("Tickets per customer per month"),
    avgResolutionHours: z.number(),
    topLabel: z.string(),
    topTickets: z.number(),
  }),
  rows: z
    .array(z.object({ key: z.string(), label: z.string(), tickets: z.number(), ticketsPerCustomer: z.number(), avgResolutionHours: z.number(), bugTickets: z.number() }))
    .describe("Most tickets first, except by month/quarter which are chronological"),
});

export const supportLoad = defineCapability({
  id: "orbit.support_load",
  organizationId: ORG,
  description:
    "Support tickets for a date range, grouped by segment, plan, category, product feature, month or quarter. Use to find where customers struggle, including bug hotspots by feature.",
  explanation: "Counts tickets and relates them to the number of customers, so busy segments can be compared fairly.",
  requiredPermission: ORBIT_PERMISSIONS.support,
  datasetVersion: ORBIT_DATASET_VERSION,
  inputSchema: z
    .strictObject({
      dateFrom: date,
      dateTo: date,
      groupBy: z.enum(["segment", "plan", "category", "feature", "month", "quarter"]),
      segment: segment.optional(),
      planId: planId.optional(),
      category: category.optional(),
      feature: feature.optional(),
    })
    .refine(rangeOk, rangeMessage),
  outputSchema: supportOutput,
  async execute(input) {
    const months = new Set(monthRange(input.dateFrom, input.dateTo));
    const ds = getOrbitDataset();
    const exposure = rowsIn(input.dateFrom, input.dateTo, input).filter((r) => !r.churned).length;
    const tickets = ds.tickets.filter(
      (t) =>
        months.has(t.month) &&
        (!input.segment || t.segment === input.segment) &&
        (!input.planId || t.planId === input.planId) &&
        (!input.category || t.category === (input.category as TicketCategory)) &&
        (!input.feature || t.feature === input.feature),
    );
    const groups = new Map<string, { label: string; tickets: number; hours: number; bugs: number }>();
    for (const t of tickets) {
      const k =
        input.groupBy === "segment"
          ? { key: t.segment, label: segmentName(t.segment) }
          : input.groupBy === "plan"
            ? { key: t.planId, label: planName(t.planId) }
            : input.groupBy === "category"
              ? { key: t.category, label: t.category }
              : input.groupBy === "feature"
                ? { key: t.feature ?? "general", label: t.feature ? featureName(t.feature) : "Not feature-specific" }
                : period(t.month, input.groupBy);
      const g = groups.get(k.key) ?? { label: k.label, tickets: 0, hours: 0, bugs: 0 };
      g.tickets += 1;
      g.hours += t.hoursToResolve;
      if (t.category === "bug") g.bugs += 1;
      groups.set(k.key, g);
    }
    const chronological = input.groupBy === "month" || input.groupBy === "quarter";
    const rows = [...groups.entries()]
      .map(([key, g]) => ({ key, label: g.label, tickets: g.tickets, ticketsPerCustomer: ratio(g.tickets, exposure), avgResolutionHours: Math.round(ratio(g.hours, g.tickets) * 10) / 10, bugTickets: g.bugs }))
      .sort((a, b) => (chronological ? a.key.localeCompare(b.key) : b.tickets - a.tickets));
    const top = [...rows].sort((a, b) => b.tickets - a.tickets)[0];
    return {
      data: {
        summary: {
          totalTickets: tickets.length,
          ticketsPerCustomer: ratio(tickets.length, exposure),
          avgResolutionHours: Math.round(ratio(tickets.reduce((a, t) => a + t.hoursToResolve, 0), tickets.length) * 10) / 10,
          topLabel: top?.label ?? "none",
          topTickets: top?.tickets ?? 0,
        },
        rows,
      },
      metricDefinitions: [METRICS.ticketsPerAccount],
      timeRange: { from: input.dateFrom, to: input.dateTo },
    };
  },
});

// --- Adoption -------------------------------------------------------------

const adoptionOutput = z.object({
  summary: z.object({ overallAdoption: z.number().describe("Fraction"), topLabel: z.string(), topRate: z.number(), lowestLabel: z.string(), lowestRate: z.number() }),
  rows: z
    .array(z.object({ key: z.string(), label: z.string(), adoptionRate: z.number().describe("Fraction of customers using the feature(s)"), customers: z.number().describe("Average customers in the group") }))
    .describe("Highest adoption first, except by month/quarter which are chronological"),
});

export const adoption = defineCapability({
  id: "orbit.adoption",
  organizationId: ORG,
  description: "How many customers use each product feature, grouped by feature, segment, plan, month or quarter. Use for product usage and adoption questions.",
  explanation: "Compares customers using a feature with all customers, averaged across the months and features selected.",
  requiredPermission: ORBIT_PERMISSIONS.usage,
  datasetVersion: ORBIT_DATASET_VERSION,
  inputSchema: z
    .strictObject({
      dateFrom: date,
      dateTo: date,
      groupBy: z.enum(["feature", "segment", "plan", "month", "quarter"]),
      feature: feature.optional(),
      segment: segment.optional(),
      planId: planId.optional(),
    })
    .refine(rangeOk, rangeMessage),
  outputSchema: adoptionOutput,
  async execute(input) {
    const months = new Set(monthRange(input.dateFrom, input.dateTo));
    const rows = getOrbitDataset().featureMonths.filter(
      (r) => months.has(r.month) && (!input.feature || r.feature === input.feature) && (!input.segment || r.segment === input.segment) && (!input.planId || r.planId === input.planId),
    );
    const groups = new Map<string, { label: string; adopters: number; active: number; cells: Map<string, number> }>();
    for (const r of rows) {
      const k =
        input.groupBy === "feature"
          ? { key: r.feature, label: featureName(r.feature) }
          : input.groupBy === "segment"
            ? { key: r.segment, label: segmentName(r.segment) }
            : input.groupBy === "plan"
              ? { key: r.planId, label: planName(r.planId) }
              : period(r.month, input.groupBy);
      const g = groups.get(k.key) ?? { label: k.label, adopters: 0, active: 0, cells: new Map() };
      g.adopters += r.adopters;
      g.active += r.active;
      g.cells.set(`${r.month}|${r.segment}|${r.planId}`, r.active);
      groups.set(k.key, g);
    }
    const chronological = input.groupBy === "month" || input.groupBy === "quarter";
    const out = [...groups.entries()]
      .map(([key, g]) => {
        const distinctMonths = new Set([...g.cells.keys()].map((c) => c.split("|")[0])).size || 1;
        return { key, label: g.label, adoptionRate: ratio(g.adopters, g.active), customers: Math.round([...g.cells.values()].reduce((a, b) => a + b, 0) / distinctMonths) };
      })
      .sort((a, b) => (chronological ? a.key.localeCompare(b.key) : b.adoptionRate - a.adoptionRate));
    const byRate = [...out].sort((a, b) => b.adoptionRate - a.adoptionRate);
    const totalAdopters = rows.reduce((a, r) => a + r.adopters, 0);
    const totalActive = rows.reduce((a, r) => a + r.active, 0);
    return {
      data: {
        summary: { overallAdoption: ratio(totalAdopters, totalActive), topLabel: byRate[0]?.label ?? "none", topRate: byRate[0]?.adoptionRate ?? 0, lowestLabel: byRate.at(-1)?.label ?? "none", lowestRate: byRate.at(-1)?.adoptionRate ?? 0 },
        rows: out,
      },
      metricDefinitions: [METRICS.adoption],
      timeRange: { from: input.dateFrom, to: input.dateTo },
    };
  },
});

// --- Segment health -------------------------------------------------------

const MIN_COHORT = 5;

const healthOutput = z.object({
  summary: z.object({ highestSupportLabel: z.string(), highestSupportRate: z.number(), lowestAdoptionLabel: z.string(), lowestAdoptionRate: z.number().describe("Fraction") }),
  rows: z
    .array(z.object({ key: z.string(), label: z.string(), customers: z.number(), ticketsPerCustomer: z.number(), adoptionRate: z.number().describe("Fraction") }))
    .describe("Most tickets per customer first"),
});

export const segmentHealth = defineCapability({
  id: "orbit.segment_health",
  organizationId: ORG,
  description:
    "Support load against product adoption for every segment and plan combination. Use to find groups with high support volume and low adoption. Groups with fewer than five customers are suppressed.",
  explanation: "Puts tickets per customer next to feature adoption for each segment and plan, hiding groups too small to be reported safely.",
  requiredPermission: ORBIT_PERMISSIONS.support,
  datasetVersion: ORBIT_DATASET_VERSION,
  inputSchema: z.strictObject({ dateFrom: date, dateTo: date }).refine(rangeOk, rangeMessage),
  outputSchema: healthOutput,
  async execute(input) {
    const ds = getOrbitDataset();
    const months = new Set(monthRange(input.dateFrom, input.dateTo));
    const exposure = new Map<string, number>();
    for (const r of ds.accountMonths) {
      if (!months.has(r.month) || r.churned) continue;
      const k = `${r.segment}|${r.planId}`;
      exposure.set(k, (exposure.get(k) ?? 0) + 1);
    }
    const tickets = new Map<string, number>();
    for (const t of ds.tickets) if (months.has(t.month)) tickets.set(`${t.segment}|${t.planId}`, (tickets.get(`${t.segment}|${t.planId}`) ?? 0) + 1);
    const adopt = new Map<string, { a: number; n: number }>();
    for (const r of ds.featureMonths) {
      if (!months.has(r.month)) continue;
      const k = `${r.segment}|${r.planId}`;
      const v = adopt.get(k) ?? { a: 0, n: 0 };
      v.a += r.adopters;
      v.n += r.active;
      adopt.set(k, v);
    }

    const span = Math.max(1, months.size);
    let suppressed = 0;
    const rows = [...exposure.entries()]
      .flatMap(([k, accountMonths]) => {
        const customers = Math.round(accountMonths / span);
        if (customers < MIN_COHORT) {
          suppressed += 1;
          return [];
        }
        const [seg, plan] = k.split("|");
        return [{ key: k, label: `${segmentName(seg)} · ${planName(plan)}`, customers, ticketsPerCustomer: ratio(tickets.get(k) ?? 0, accountMonths), adoptionRate: ratio(adopt.get(k)?.a ?? 0, adopt.get(k)?.n ?? 0) }];
      })
      .sort((a, b) => b.ticketsPerCustomer - a.ticketsPerCustomer);
    const lowest = [...rows].sort((a, b) => a.adoptionRate - b.adoptionRate)[0];
    return {
      data: {
        summary: { highestSupportLabel: rows[0]?.label ?? "none", highestSupportRate: rows[0]?.ticketsPerCustomer ?? 0, lowestAdoptionLabel: lowest?.label ?? "none", lowestAdoptionRate: lowest?.adoptionRate ?? 0 },
        rows,
      },
      metricDefinitions: [METRICS.ticketsPerAccount, METRICS.adoption],
      timeRange: { from: input.dateFrom, to: input.dateTo },
      disclosures: suppressed > 0 ? ["Groups with fewer than five customers are hidden"] : undefined,
    };
  },
});

// --- Accounts at risk -----------------------------------------------------

const riskOutput = z.object({
  summary: z.object({ listed: z.number(), topName: z.string(), topRisk: z.number(), listedMrr: z.number().nullable().describe("null when the caller's role may not see revenue") }),
  rows: z
    .array(
      z.object({
        accountId: z.string(),
        name: z.string(),
        segment: z.string(),
        plan: z.string(),
        mrr: z.number().nullable().describe("null when the caller's role may not see revenue"),
        featuresUsed: z.number(),
        tickets90Days: z.number(),
        riskScore: z.number().describe("0 to 1, higher is riskier"),
        reason: z.string(),
      }),
    )
    .describe("Riskiest first"),
});

export const accountsAtRisk = defineCapability({
  id: "orbit.accounts_at_risk",
  organizationId: ORG,
  description:
    "Named customer accounts most at risk of leaving, scored from low feature usage, recent support tickets and the Growth plan price change. MRR is shown only to roles that may see revenue.",
  explanation: "Scores each current customer on how little of the product they use and how many tickets they raised in the last 90 days.",
  requiredPermission: ORBIT_PERMISSIONS.accounts,
  datasetVersion: ORBIT_DATASET_VERSION,
  inputSchema: z.strictObject({ asOf: date, segment: segment.optional(), planId: planId.optional(), limit: z.number().int().min(1).max(15).optional() }),
  outputSchema: riskOutput,
  async execute(input, ctx) {
    const showRevenue = sees(ctx, ORBIT_PERMISSIONS.revenue);
    const ds = getOrbitDataset();
    const month = input.asOf.slice(0, 7);
    const launched = FEATURES.filter((f) => f.launch <= month).length || 1;
    const window = new Set(monthRange(prevMonth(prevMonth(month)), month));
    const recent = new Map<string, number>();
    for (const t of ds.tickets) if (window.has(t.month)) recent.set(t.accountId, (recent.get(t.accountId) ?? 0) + 1);
    const accounts = new Map(ds.accounts.map((a) => [a.id, a]));

    const scored = rowsIn(month, month, input)
      .filter((r) => !r.churned)
      .map((r) => {
        const tickets = recent.get(r.accountId) ?? 0;
        const priceChange = r.planId === "growth" && month >= "2026-07";
        const score = Math.min(1, 0.6 * (1 - r.featuresUsed / launched) + 0.4 * Math.min(tickets / 6, 1) + (priceChange ? 0.1 : 0));
        return {
          accountId: r.accountId,
          name: accounts.get(r.accountId)?.name ?? r.accountId,
          segment: segmentName(r.segment),
          plan: planName(r.planId),
          mrr: showRevenue ? r.mrrEnd : null,
          mrrValue: r.mrrEnd,
          featuresUsed: r.featuresUsed,
          tickets90Days: tickets,
          riskScore: Math.round(score * 100) / 100,
          reason: `Uses ${r.featuresUsed} of ${launched} features, raised ${tickets} tickets in 90 days${priceChange ? ", on the Growth plan after the price change" : ""}`,
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore || a.accountId.localeCompare(b.accountId))
      .slice(0, input.limit ?? 10);

    return {
      data: {
        summary: {
          listed: scored.length,
          topName: scored[0]?.name ?? "none",
          topRisk: scored[0]?.riskScore ?? 0,
          listedMrr: showRevenue ? scored.reduce((a, r) => a + r.mrrValue, 0) : null,
        },
        rows: scored.map((r) => ({
          accountId: r.accountId,
          name: r.name,
          segment: r.segment,
          plan: r.plan,
          mrr: r.mrr,
          featuresUsed: r.featuresUsed,
          tickets90Days: r.tickets90Days,
          riskScore: r.riskScore,
          reason: r.reason,
        })),
      },
      metricDefinitions: [METRICS.adoption, METRICS.ticketsPerAccount],
      timeRange: { from: `${month}-01`, to: input.asOf },
      disclosures: showRevenue ? undefined : ["Revenue figures (account MRR) are hidden for this role"],
    };
  },
});
