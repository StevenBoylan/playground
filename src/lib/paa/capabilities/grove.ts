import { z } from "zod";
import { monthLabel, quarterKey, quarterLabel } from "../dates";
import {
  COURSES,
  DEPARTMENTS,
  GROVE_DATASET_VERSION,
  LEAVE_TYPES,
  LEVELS,
  LOCATIONS,
  STAGES,
  THEMES,
  getGroveDataset,
  type HeadcountMonth,
} from "../data/grove-seed";
import { monthRange } from "../data/orbit-seed";
import { MIN_COHORT, SMALL_GROUP_NOTICE, mergeSmallGroups } from "../policies/disclosure";
import { GROVE_PERMISSIONS } from "../policies/roles";
import type { AuthorizedContext, MetricDefinition } from "../schemas/capability";
import { defineCapability } from "./define";

const ORG = "grove";
const date = z.iso.date().describe("YYYY-MM-DD. Grove's data is monthly (surveys and training are quarterly), so a range selects whole months");
const department = z.enum(DEPARTMENTS.map((d) => d.id) as [string, ...string[]]).describe(DEPARTMENTS.map((d) => d.id).join(", "));
const course = z.enum(COURSES.map((c) => c.id) as [string, ...string[]]).describe(COURSES.map((c) => c.id).join(", "));
const leaveType = z.enum(LEAVE_TYPES.map((t) => t.id) as [string, ...string[]]).describe(LEAVE_TYPES.map((t) => t.id).join(", "));
const rangeOk = (v: { dateFrom: string; dateTo: string }) => v.dateFrom <= v.dateTo;
const rangeMessage = { message: "dateFrom must not be after dateTo" };

const METRICS: Record<string, MetricDefinition> = {
  headcount: { name: "Headcount", formula: "People employed at the end of the month", unit: "people" },
  attrition: { name: "Attrition rate", formula: "Leavers ÷ average headcount over the period, annualised", unit: "% per year" },
  funnel: { name: "Hiring funnel", formula: "Candidates reaching each stage in the period; conversion is stage ÷ previous stage", unit: "candidates" },
  training: { name: "Training completion", formula: "People who completed a mandatory course ÷ people enrolled, at quarter end", unit: "% of enrolled" },
  leave: { name: "Leave", formula: "Days of leave taken; per-person figures divide by average headcount", unit: "days" },
  engagement: { name: "Engagement score", formula: "Survey score from 0 to 100, averaged across respondents (weighted by responses)", unit: "points" },
};

const deptName = (id: string) => DEPARTMENTS.find((d) => d.id === id)?.name ?? id;
const levelName = (id: string) => LEVELS.find((l) => l.id === id)?.name ?? id;
const locationName = (id: string) => LOCATIONS.find((l) => l.id === id)?.name ?? id;
const ratio = (a: number, b: number) => (b === 0 ? 0 : a / b);
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Defence in depth: the policy layer already narrows or denies a request for a department outside the role's scope,
 * and the service also filters by scope itself.
 */
function allowedDepartments(ctx: AuthorizedContext, requested?: string): Set<string> {
  const scope = ctx.scope.departments ?? "all";
  const all = DEPARTMENTS.map((d) => d.id).filter((id) => scope === "all" || scope.includes(id));
  return new Set(requested ? all.filter((id) => id === requested) : all);
}

function headcountRows(months: Set<string>, depts: Set<string>): HeadcountMonth[] {
  return getGroveDataset().headcount.filter((r) => months.has(r.month) && depts.has(r.department));
}

/** People at the start of the window for each group: the first month's end headcount, less its hires, plus its leavers. */
function startOfWindow(rows: HeadcountMonth[], firstMonth: string, keyOf: (r: HeadcountMonth) => string): Map<string, number> {
  const start = new Map<string, number>();
  for (const r of rows) {
    if (r.month !== firstMonth) continue;
    start.set(keyOf(r), (start.get(keyOf(r)) ?? 0) + r.headcount - r.hires + r.leavers);
  }
  return start;
}

const periodOf = (month: string, granularity: "month" | "quarter") =>
  granularity === "month" ? { key: month, label: monthLabel(month) } : { key: quarterKey(`${month}-01`), label: quarterLabel(quarterKey(`${month}-01`)) };

// --- Headcount trend ------------------------------------------------------

const trendOutput = z.object({
  summary: z.object({
    currentHeadcount: z.number().nullable().describe("null when the group has fewer than five people"),
    startHeadcount: z.number().nullable(),
    change: z.number().nullable(),
    changePct: z.number().nullable().describe("Fraction"),
    hires: z.number().nullable(),
    leavers: z.number().nullable(),
    attritionRate: z.number().nullable().describe("Annualised, as a fraction"),
  }),
  rows: z.array(z.object({ period: z.string(), label: z.string(), headcount: z.number(), hires: z.number(), leavers: z.number(), netChange: z.number() })).describe("Chronological"),
});

export const headcountTrend = defineCapability({
  id: "grove.headcount_trend",
  organizationId: ORG,
  description: "Headcount over time (by month or quarter) with hires and leavers, for the company or one department. Use for growth and attrition questions.",
  explanation: "Adds up the monthly headcount records. Only counts are used: no individual is identified.",
  requiredPermission: GROVE_PERMISSIONS.headcount,
  scopeField: "department",
  datasetVersion: GROVE_DATASET_VERSION,
  inputSchema: z.strictObject({ dateFrom: date, dateTo: date, granularity: z.enum(["month", "quarter"]), department: department.optional() }).refine(rangeOk, rangeMessage),
  outputSchema: trendOutput,
  async execute(input, ctx) {
    const months = monthRange(input.dateFrom, input.dateTo);
    const depts = allowedDepartments(ctx, input.department);
    const rows = headcountRows(new Set(months), depts);
    const byMonth = new Map<string, { headcount: number; hires: number; leavers: number }>();
    for (const r of rows) {
      const m = byMonth.get(r.month) ?? { headcount: 0, hires: 0, leavers: 0 };
      m.headcount += r.headcount;
      m.hires += r.hires;
      m.leavers += r.leavers;
      byMonth.set(r.month, m);
    }
    const first = months.find((m) => byMonth.has(m));
    const latest = first ? byMonth.get(months.filter((m) => byMonth.has(m)).at(-1)!)!.headcount : 0;
    // Withheld means withheld: every figure is null, which the screen shows as a dash, never as zero.
    const empty = { summary: { currentHeadcount: null, startHeadcount: null, change: null, changePct: null, hires: null, leavers: null, attritionRate: null }, rows: [] };

    // A single group that is too small to report is withheld entirely.
    if (input.department && latest < MIN_COHORT) {
      return {
        data: empty,
        metricDefinitions: [METRICS.headcount],
        timeRange: { from: input.dateFrom, to: input.dateTo },
        disclosures: ["This group has fewer than five people, so it is not reported"],
      };
    }

    const groups = new Map<string, { label: string; months: string[] }>();
    for (const m of months.filter((m) => byMonth.has(m))) {
      const p = periodOf(m, input.granularity);
      const g = groups.get(p.key) ?? { label: p.label, months: [] };
      g.months.push(m);
      groups.set(p.key, g);
    }
    const out = [...groups.entries()].map(([key, g]) => {
      const hires = g.months.reduce((a, m) => a + byMonth.get(m)!.hires, 0);
      const leavers = g.months.reduce((a, m) => a + byMonth.get(m)!.leavers, 0);
      return { period: key, label: g.label, headcount: byMonth.get(g.months.at(-1)!)!.headcount, hires, leavers, netChange: hires - leavers };
    });
    const start = first ? [...startOfWindow(rows, first, () => "all").values()][0] ?? 0 : 0;
    const hires = out.reduce((a, r) => a + r.hires, 0);
    const leavers = out.reduce((a, r) => a + r.leavers, 0);
    const average = ratio([...byMonth.values()].reduce((a, m) => a + m.headcount, 0), byMonth.size);
    return {
      data: {
        summary: {
          currentHeadcount: latest,
          startHeadcount: start,
          change: latest - start,
          changePct: ratio(latest - start, start),
          hires,
          leavers,
          attritionRate: ratio(leavers, average) * (12 / Math.max(1, byMonth.size)),
        },
        rows: out,
      },
      metricDefinitions: [METRICS.headcount, METRICS.attrition],
      timeRange: { from: input.dateFrom, to: input.dateTo },
    };
  },
});

// --- Headcount change by group --------------------------------------------

const changeRow = z.object({
  key: z.string(),
  label: z.string(),
  startHeadcount: z.number(),
  endHeadcount: z.number(),
  change: z.number(),
  changePct: z.number().describe("Fraction"),
  hires: z.number(),
  leavers: z.number(),
});
type ChangeRow = z.infer<typeof changeRow>;

const changeOutput = z.object({
  summary: z.object({
    totalStart: z.number(),
    totalEnd: z.number(),
    totalChange: z.number(),
    totalChangePct: z.number().describe("Fraction"),
    largestGrowthLabel: z.string(),
    largestGrowth: z.number(),
    largestDeclineLabel: z.string(),
    largestDecline: z.number(),
  }),
  rows: z.array(changeRow).describe("Largest end headcount first; small groups are combined into 'Other (small groups)'"),
});

export const headcountChange = defineCapability({
  id: "grove.headcount_change",
  organizationId: ORG,
  description:
    "How headcount changed over a period for each department, level or location, with hires and leavers. Groups with fewer than five people are combined into 'Other'. Use for 'headcount changes by department' questions.",
  explanation: "Compares headcount at the start and end of the period for each group, combining groups too small to report.",
  requiredPermission: GROVE_PERMISSIONS.headcount,
  scopeField: "department",
  datasetVersion: GROVE_DATASET_VERSION,
  inputSchema: z.strictObject({ dateFrom: date, dateTo: date, groupBy: z.enum(["department", "level", "location"]), department: department.optional() }).refine(rangeOk, rangeMessage),
  outputSchema: changeOutput,
  async execute(input, ctx) {
    const months = monthRange(input.dateFrom, input.dateTo);
    const depts = allowedDepartments(ctx, input.department);
    const rows = headcountRows(new Set(months), depts);
    const keyOf = (r: HeadcountMonth) => (input.groupBy === "department" ? r.department : input.groupBy === "level" ? r.level : r.location);
    const labelOf = (key: string) => (input.groupBy === "department" ? deptName(key) : input.groupBy === "level" ? levelName(key) : locationName(key));
    const present = months.filter((m) => rows.some((r) => r.month === m));
    const first = present[0];
    const last = present.at(-1);

    const groups = new Map<string, ChangeRow>();
    const get = (key: string): ChangeRow => {
      const g = groups.get(key) ?? { key, label: labelOf(key), startHeadcount: 0, endHeadcount: 0, change: 0, changePct: 0, hires: 0, leavers: 0 };
      groups.set(key, g);
      return g;
    };
    for (const [key, n] of startOfWindow(rows, first ?? "", keyOf)) get(key).startHeadcount = n;
    for (const r of rows) {
      const g = get(keyOf(r));
      g.hires += r.hires;
      g.leavers += r.leavers;
      if (r.month === last) g.endHeadcount += r.headcount;
    }
    const all = [...groups.values()].map((g) => ({ ...g, change: g.endHeadcount - g.startHeadcount, changePct: ratio(g.endHeadcount - g.startHeadcount, g.startHeadcount) }));
    const totals = all.reduce((a, g) => ({ start: a.start + g.startHeadcount, end: a.end + g.endHeadcount }), { start: 0, end: 0 });

    const merged = mergeSmallGroups(
      all.sort((a, b) => b.endHeadcount - a.endHeadcount),
      (g) => Math.min(g.startHeadcount, g.endHeadcount),
      (a, b) => {
        const start = a.startHeadcount + b.startHeadcount;
        const end = a.endHeadcount + b.endHeadcount;
        return { ...a, startHeadcount: start, endHeadcount: end, change: end - start, changePct: ratio(end - start, start), hires: a.hires + b.hires, leavers: a.leavers + b.leavers };
      },
    );
    const shown = merged.rows.filter((r) => r.key !== "other");
    const growth = [...shown].sort((a, b) => b.change - a.change);
    return {
      data: {
        summary: {
          totalStart: totals.start,
          totalEnd: totals.end,
          totalChange: totals.end - totals.start,
          totalChangePct: ratio(totals.end - totals.start, totals.start),
          largestGrowthLabel: growth[0]?.label ?? "none",
          largestGrowth: growth[0]?.change ?? 0,
          largestDeclineLabel: growth.at(-1)?.label ?? "none",
          largestDecline: growth.at(-1)?.change ?? 0,
        },
        rows: merged.rows,
      },
      metricDefinitions: [METRICS.headcount],
      timeRange: { from: input.dateFrom, to: input.dateTo },
      disclosures: merged.merged > 0 ? [SMALL_GROUP_NOTICE] : undefined,
    };
  },
});

// --- Hiring funnel --------------------------------------------------------

const funnelOutput = z.object({
  summary: z.object({
    applied: z.number().nullable(),
    hires: z.number().nullable(),
    biggestDropLabel: z.string().describe("The stage where the most candidates are lost"),
    biggestDropRate: z.number().describe("Fraction of the previous stage lost at that stage"),
    offerAcceptanceRate: z.number().describe("Hired ÷ offered, as a fraction"),
    avgDaysToHire: z.number(),
  }),
  rows: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        candidates: z.number().nullable().describe("null when fewer than five candidates reached the stage"),
        conversionFromPrevious: z.number().nullable().describe("Fraction"),
        dropOffFromPrevious: z.number().nullable().describe("Fraction lost since the previous stage"),
      }),
    )
    .describe("In funnel order"),
});

export const hiringFunnel = defineCapability({
  id: "grove.hiring_funnel",
  organizationId: ORG,
  description: "The hiring funnel (applied, screened, interviewed, offered, hired) with conversion and drop-off at each stage, for the company or one department. Use to find where candidates are lost.",
  explanation: "Counts candidates reaching each stage in the period and compares each stage with the one before.",
  requiredPermission: GROVE_PERMISSIONS.hiring,
  scopeField: "department",
  datasetVersion: GROVE_DATASET_VERSION,
  inputSchema: z.strictObject({ dateFrom: date, dateTo: date, department: department.optional() }).refine(rangeOk, rangeMessage),
  outputSchema: funnelOutput,
  async execute(input, ctx) {
    const months = new Set(monthRange(input.dateFrom, input.dateTo));
    const depts = allowedDepartments(ctx, input.department);
    const rows = getGroveDataset().funnel.filter((r) => months.has(r.month) && depts.has(r.department));
    const total = rows.reduce(
      (a, r) => ({ applied: a.applied + r.applied, screened: a.screened + r.screened, interviewed: a.interviewed + r.interviewed, offered: a.offered + r.offered, hired: a.hired + r.hired, days: a.days + r.daysToHireTotal }),
      { applied: 0, screened: 0, interviewed: 0, offered: 0, hired: 0, days: 0 },
    );
    const counts = [total.applied, total.screened, total.interviewed, total.offered, total.hired];
    let hidden = false;
    const stages = STAGES.map((s, i) => {
      const n = counts[i];
      const prev = i === 0 ? undefined : counts[i - 1];
      // A stage reached by fewer than five candidates is not reported; nor is anything derived from it.
      if (n < MIN_COHORT || (prev !== undefined && prev < MIN_COHORT)) {
        hidden = true;
        return { key: s.id, label: s.name, candidates: null, conversionFromPrevious: null, dropOffFromPrevious: null };
      }
      return { key: s.id, label: s.name, candidates: n, conversionFromPrevious: prev === undefined ? null : n / prev, dropOffFromPrevious: prev === undefined ? null : 1 - n / prev };
    });
    const drops = stages.filter((s) => s.dropOffFromPrevious !== null).sort((a, b) => (b.dropOffFromPrevious ?? 0) - (a.dropOffFromPrevious ?? 0));
    const reported = !hidden && total.hired >= MIN_COHORT;
    return {
      data: {
        summary: {
          applied: stages[0].candidates,
          hires: stages[4].candidates,
          biggestDropLabel: drops[0]?.label ?? "none",
          biggestDropRate: drops[0]?.dropOffFromPrevious ?? 0,
          offerAcceptanceRate: reported ? ratio(total.hired, total.offered) : 0,
          avgDaysToHire: reported ? Math.round(ratio(total.days, total.hired)) : 0,
        },
        rows: stages,
      },
      metricDefinitions: [METRICS.funnel],
      timeRange: { from: input.dateFrom, to: input.dateTo },
      disclosures: hidden ? ["Stages reached by fewer than five candidates are not reported"] : undefined,
    };
  },
});

// --- Training completion --------------------------------------------------

const trainingOutput = z.object({
  summary: z.object({ overallRate: z.number().describe("Fraction"), enrolled: z.number(), completed: z.number(), lowestLabel: z.string(), lowestRate: z.number().describe("Fraction") }),
  rows: z
    .array(z.object({ key: z.string(), label: z.string(), enrolled: z.number(), completed: z.number(), completionRate: z.number().describe("Fraction") }))
    .describe("Lowest completion first; small groups are combined into 'Other (small groups)'"),
});
type TrainingRow = z.infer<typeof trainingOutput>["rows"][number];

export const trainingCompletion = defineCapability({
  id: "grove.training_completion",
  organizationId: ORG,
  description: "Completion of mandatory training (security, privacy, conduct, manager essentials) at the end of the quarter containing a date, by department or by course.",
  explanation: "Compares people who completed each course with people enrolled, combining groups too small to report.",
  requiredPermission: GROVE_PERMISSIONS.training,
  scopeField: "department",
  datasetVersion: GROVE_DATASET_VERSION,
  inputSchema: z.strictObject({ asOf: date, groupBy: z.enum(["department", "course"]), department: department.optional(), course: course.optional() }),
  outputSchema: trainingOutput,
  async execute(input, ctx) {
    const quarter = quarterKey(input.asOf);
    const depts = allowedDepartments(ctx, input.department);
    const rows = getGroveDataset().training.filter((r) => r.quarter === quarter && depts.has(r.department) && (!input.course || r.course === input.course));
    const groups = new Map<string, TrainingRow>();
    for (const r of rows) {
      const key = input.groupBy === "department" ? r.department : r.course;
      const label = input.groupBy === "department" ? deptName(key) : (COURSES.find((c) => c.id === key)?.name ?? key);
      const g = groups.get(key) ?? { key, label, enrolled: 0, completed: 0, completionRate: 0 };
      g.enrolled += r.enrolled;
      g.completed += r.completed;
      groups.set(key, g);
    }
    const all = [...groups.values()].map((g) => ({ ...g, completionRate: ratio(g.completed, g.enrolled) }));
    const merged = mergeSmallGroups(all, (g) => g.enrolled, (a, b) => ({ ...a, enrolled: a.enrolled + b.enrolled, completed: a.completed + b.completed, completionRate: ratio(a.completed + b.completed, a.enrolled + b.enrolled) }));
    const out = [...merged.rows].sort((a, b) => a.completionRate - b.completionRate);
    const enrolled = all.reduce((a, g) => a + g.enrolled, 0);
    const completed = all.reduce((a, g) => a + g.completed, 0);
    const lowest = out.filter((r) => r.key !== "other")[0];
    return {
      data: { summary: { overallRate: ratio(completed, enrolled), enrolled, completed, lowestLabel: lowest?.label ?? "none", lowestRate: lowest?.completionRate ?? 0 }, rows: out },
      metricDefinitions: [METRICS.training],
      timeRange: { from: `${input.asOf.slice(0, 7)}-01`, to: input.asOf },
      disclosures: merged.merged > 0 ? [SMALL_GROUP_NOTICE] : undefined,
    };
  },
});

// --- Leave ----------------------------------------------------------------

const leaveOutput = z.object({
  summary: z.object({ totalDays: z.number(), daysPerEmployee: z.number().describe("Over the whole period, per average employee"), highestLabel: z.string(), highestDays: z.number() }),
  rows: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        leaveDays: z.number().nullable().describe("null when fewer than five people took leave"),
        people: z.number().nullable().describe("Person-months in which leave was taken"),
        daysPerEmployee: z.number().nullable(),
      }),
    )
    .describe("Most days first, except by month/quarter which are chronological"),
});
type LeaveRow = z.infer<typeof leaveOutput>["rows"][number];

export const leaveSummary = defineCapability({
  id: "grove.leave_summary",
  organizationId: ORG,
  description: "Aggregate leave taken (annual, sick, parental, other) by department, leave type, month or quarter. Only aggregates; groups with fewer than five people are combined or withheld.",
  explanation: "Totals days of leave from aggregate records and relates them to headcount. No individual's leave is visible.",
  requiredPermission: GROVE_PERMISSIONS.leave,
  scopeField: "department",
  datasetVersion: GROVE_DATASET_VERSION,
  inputSchema: z
    .strictObject({ dateFrom: date, dateTo: date, groupBy: z.enum(["department", "type", "month", "quarter"]), type: leaveType.optional(), department: department.optional() })
    .refine(rangeOk, rangeMessage),
  outputSchema: leaveOutput,
  async execute(input, ctx) {
    const months = monthRange(input.dateFrom, input.dateTo);
    const set = new Set(months);
    const depts = allowedDepartments(ctx, input.department);
    const rows = getGroveDataset().leave.filter((r) => set.has(r.month) && depts.has(r.department) && (!input.type || r.type === input.type));
    const hc = headcountRows(set, depts);
    const avgHeadcount = ratio(hc.reduce((a, r) => a + r.headcount, 0), new Set(hc.map((r) => r.month)).size);

    const chronological = input.groupBy === "month" || input.groupBy === "quarter";
    // Group size is the most people taking leave in any one month: person-months accumulate across a year, but a
    // handful of people on long leave must never look like a large group.
    const groups = new Map<string, { label: string; days: number; takers: number; headcount: number; peak: number }>();
    const monthly = new Map<string, number>();
    for (const r of rows) {
      const k =
        input.groupBy === "department"
          ? { key: r.department, label: deptName(r.department) }
          : input.groupBy === "type"
            ? { key: r.type, label: LEAVE_TYPES.find((t) => t.id === r.type)?.name ?? r.type }
            : periodOf(r.month, input.groupBy);
      const g = groups.get(k.key) ?? { label: k.label, days: 0, takers: 0, headcount: 0, peak: 0 };
      g.days += r.days;
      g.takers += r.takers;
      const inMonth = (monthly.get(`${k.key}|${r.month}`) ?? 0) + r.takers;
      monthly.set(`${k.key}|${r.month}`, inMonth);
      g.peak = Math.max(g.peak, inMonth);
      groups.set(k.key, g);
    }
    const peakOf = new Map([...groups.entries()].map(([key, g]) => [key, g.peak]));
    if (input.groupBy === "department") {
      for (const [key, g] of groups) g.headcount = ratio(hc.filter((r) => r.department === key).reduce((a, r) => a + r.headcount, 0), new Set(hc.map((r) => r.month)).size);
    }
    const perEmployee = (days: number, headcount: number) => round1(ratio(days, headcount || avgHeadcount));

    let all: LeaveRow[] = [...groups.entries()].map(([key, g]) => ({ key, label: g.label, leaveDays: g.days, people: g.takers, daysPerEmployee: perEmployee(g.days, g.headcount) }));
    let disclosure: string | undefined;
    if (chronological) {
      // Periods cannot be merged, so a period with fewer than five people is withheld instead.
      all = all.sort((a, b) => a.key.localeCompare(b.key)).map((r) => ((peakOf.get(r.key) ?? 0) < MIN_COHORT ? { ...r, leaveDays: null, people: null, daysPerEmployee: null } : r));
      if (all.some((r) => r.leaveDays === null)) disclosure = "Periods in which fewer than five people took leave are not reported";
    } else {
      const merged = mergeSmallGroups(all, (g) => peakOf.get(g.key) ?? 0, (a, b) => {
        peakOf.set(a.key, (peakOf.get(a.key) ?? 0) + (peakOf.get(b.key) ?? 0));
        return { ...a, leaveDays: (a.leaveDays ?? 0) + (b.leaveDays ?? 0), people: (a.people ?? 0) + (b.people ?? 0), daysPerEmployee: round1((a.daysPerEmployee ?? 0) + (b.daysPerEmployee ?? 0)) };
      });
      all = merged.rows.sort((a, b) => (b.leaveDays ?? 0) - (a.leaveDays ?? 0));
      if (merged.merged > 0) disclosure = SMALL_GROUP_NOTICE;
    }
    const totalDays = rows.reduce((a, r) => a + r.days, 0);
    const top = [...all].filter((r) => r.leaveDays !== null && r.key !== "other").sort((a, b) => (b.leaveDays ?? 0) - (a.leaveDays ?? 0))[0];
    return {
      data: { summary: { totalDays, daysPerEmployee: perEmployee(totalDays, 0), highestLabel: top?.label ?? "none", highestDays: top?.leaveDays ?? 0 }, rows: all },
      metricDefinitions: [METRICS.leave],
      timeRange: { from: input.dateFrom, to: input.dateTo },
      disclosures: disclosure ? [disclosure] : undefined,
    };
  },
});

// --- Engagement -----------------------------------------------------------

const engagementOutput = z.object({
  summary: z.object({
    overallScore: z.number().describe("0 to 100"),
    responseRate: z.number().describe("Fraction"),
    lowestLabel: z.string(),
    lowestScore: z.number(),
    highestLabel: z.string(),
    highestScore: z.number(),
  }),
  rows: z
    .array(z.object({ key: z.string(), label: z.string(), score: z.number().nullable().describe("0 to 100; null when fewer than five people responded"), responses: z.number().nullable(), responseRate: z.number().nullable() }))
    .describe("Lowest score first, except by quarter which is chronological"),
});
type EngagementRow = z.infer<typeof engagementOutput>["rows"][number];

export const engagement = defineCapability({
  id: "grove.engagement",
  organizationId: ORG,
  description: "Employee survey results: engagement score and response rate by department, by quarter, or by theme (management, growth, compensation, workload, culture). Groups with fewer than five respondents are combined or withheld.",
  explanation: "Averages survey scores weighted by the number of respondents, combining groups too small to report.",
  requiredPermission: GROVE_PERMISSIONS.engagement,
  scopeField: "department",
  datasetVersion: GROVE_DATASET_VERSION,
  inputSchema: z.strictObject({ dateFrom: date, dateTo: date, groupBy: z.enum(["department", "quarter", "theme"]), department: department.optional() }).refine(rangeOk, rangeMessage),
  outputSchema: engagementOutput,
  async execute(input, ctx) {
    const months = new Set(monthRange(input.dateFrom, input.dateTo));
    const depts = allowedDepartments(ctx, input.department);
    const rows = getGroveDataset().engagement.filter((r) => months.has(`${r.quarter.slice(0, 4)}-${String(Number(r.quarter.slice(6)) * 3).padStart(2, "0")}`) && depts.has(r.department));
    const weighted = (items: typeof rows, pick: (r: (typeof rows)[number]) => number) => ratio(items.reduce((a, r) => a + pick(r) * r.responses, 0), items.reduce((a, r) => a + r.responses, 0));
    const responses = (items: typeof rows) => items.reduce((a, r) => a + r.responses, 0);
    const population = (items: typeof rows) => items.reduce((a, r) => a + r.population, 0);

    let out: EngagementRow[] = [];
    let disclosure: string | undefined;
    if (input.groupBy === "theme") {
      // Themes describe the same people, so a population that is too small is withheld as a whole. Size is the most
      // respondents in any one survey, since the same few people answer every quarter.
      const peakResponses = Math.max(0, ...rows.map((r) => r.responses));
      if (peakResponses >= MIN_COHORT) {
        out = THEMES.map((t) => ({ key: t.id, label: t.name, score: round1(weighted(rows, (r) => r.themes[t.id])), responses: responses(rows), responseRate: ratio(responses(rows), population(rows)) }));
      } else if (rows.length > 0) disclosure = "This group has fewer than five respondents, so it is not reported";
    } else if (input.groupBy === "quarter") {
      const byQuarter = new Map<string, typeof rows>();
      for (const r of rows) byQuarter.set(r.quarter, [...(byQuarter.get(r.quarter) ?? []), r]);
      out = [...byQuarter.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([q, items]) => (responses(items) < MIN_COHORT ? { key: q, label: quarterLabel(q), score: null, responses: null, responseRate: null } : { key: q, label: quarterLabel(q), score: round1(weighted(items, (r) => r.score)), responses: responses(items), responseRate: ratio(responses(items), population(items)) }));
      if (out.some((r) => r.score === null)) disclosure = "Quarters with fewer than five respondents are not reported";
    } else {
      const byDept = new Map<string, typeof rows>();
      for (const r of rows) byDept.set(r.department, [...(byDept.get(r.department) ?? []), r]);
      const all: EngagementRow[] = [...byDept.entries()].map(([d, items]) => ({ key: d, label: deptName(d), score: round1(weighted(items, (r) => r.score)), responses: responses(items), responseRate: ratio(responses(items), population(items)) }));
      const pop = new Map([...byDept.entries()].map(([d, items]) => [d, population(items)]));
      // Distinct people: the largest respondent group in any one survey, not responses accumulated over quarters.
      const peak = new Map([...byDept.entries()].map(([d, items]) => [d, Math.max(0, ...items.map((r) => r.responses))]));
      const merged = mergeSmallGroups(
        all,
        (g) => peak.get(g.key) ?? 0,
        (a, b) => {
          const ra = a.responses ?? 0;
          const rb = b.responses ?? 0;
          const resp = ra + rb;
          const popTotal = (pop.get(a.key) ?? 0) + (pop.get(b.key) ?? 0);
          pop.set(a.key, popTotal);
          peak.set(a.key, (peak.get(a.key) ?? 0) + (peak.get(b.key) ?? 0));
          return { ...a, score: round1(ratio((a.score ?? 0) * ra + (b.score ?? 0) * rb, resp)), responses: resp, responseRate: ratio(resp, popTotal) };
        },
      );
      out = merged.rows.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
      if (merged.merged > 0) disclosure = SMALL_GROUP_NOTICE;
    }

    const scored = out.filter((r) => r.score !== null && r.key !== "other");
    const byScore = [...scored].sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
    return {
      data: {
        summary: {
          overallScore: round1(weighted(rows, (r) => r.score)),
          responseRate: ratio(responses(rows), population(rows)),
          lowestLabel: byScore[0]?.label ?? "none",
          lowestScore: byScore[0]?.score ?? 0,
          highestLabel: byScore.at(-1)?.label ?? "none",
          highestScore: byScore.at(-1)?.score ?? 0,
        },
        rows: out,
      },
      metricDefinitions: [METRICS.engagement],
      timeRange: { from: input.dateFrom, to: input.dateTo },
      disclosures: disclosure ? [disclosure] : undefined,
    };
  },
});
