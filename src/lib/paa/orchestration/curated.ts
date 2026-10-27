import { executeCapability } from "../capabilities/registry";
import { monthLabel } from "../dates";
import { REFERENCE_DATE } from "../data/seed";
import { getOrganization } from "../organizations";
import type { Envelope } from "../schemas/bindings";
import { validateExperience, type ExperienceComponent, type ExperienceSpec } from "../schemas/experience";
import type { Session } from "../schemas/capability";
import type { Decision, ExecutionRecord, Trace } from "../schemas/trace";
import { lastMonth, lastQuarter, thisMonth } from "./windows";

interface PlannedCall {
  key: string;
  capabilityId: string;
  input: Record<string, unknown>;
  rationale: string;
}

interface CuratedPrompt {
  id: string;
  organizationId: string;
  text: string;
  title: string;
  assumptions: string[];
  subtitle(): string;
  plan(): PlannedCall[];
  compose(): ExperienceComponent[];
}

const quarter = () => lastQuarter(REFERENCE_DATE);
const periodLabel = (from: string, to: string) => `${monthLabel(from.slice(0, 7))} to ${monthLabel(to.slice(0, 7))}`;

export const curatedPrompts: CuratedPrompt[] = [
  {
    id: "production-by-factory",
    organizationId: "northstar",
    text: "Show production performance for the last quarter, by factory.",
    title: "Production performance by factory",
    assumptions: ['"Last quarter" is the most recent complete quarter before the dataset reference date.'],
    subtitle: () => periodLabel(quarter().from, quarter().to),
    plan: () => [
      {
        key: "production",
        capabilityId: "northstar.production_summary",
        input: { dateFrom: quarter().from, dateTo: quarter().to, groupBy: "factory" },
        rationale: "Totals output and defect rate per factory for the quarter.",
      },
      {
        key: "trend",
        capabilityId: "northstar.production_summary",
        input: { dateFrom: quarter().from, dateTo: quarter().to, groupBy: "month" },
        rationale: "Monthly totals give the trend within the quarter.",
      },
    ],
    compose: () => [
      {
        type: "Narrative",
        id: "summary",
        template:
          "Output for the period was {{results.production.summary.totalUnits|integer}} units, with an overall defect rate of {{results.production.summary.defectRate|percent}}.",
      },
      { type: "KpiCard", id: "kpi-units", title: "Units produced", dataRef: "results.production.summary.totalUnits", format: "integer" },
      { type: "KpiCard", id: "kpi-defect", title: "Defect rate", dataRef: "results.production.summary.defectRate", format: "percent" },
      { type: "BarChart", id: "units-by-factory", title: "Units produced by factory", dataRef: "results.production.rows", xField: "label", yField: "unitsProduced", format: "integer" },
      { type: "LineChart", id: "monthly-trend", title: "Units produced by month", dataRef: "results.trend.rows", xField: "label", yField: "unitsProduced", format: "integer" },
      {
        type: "DataTable",
        id: "factory-table",
        title: "Factory detail",
        dataRef: "results.production.rows",
        columns: [
          { field: "label", label: "Factory" },
          { field: "unitsProduced", label: "Units produced", format: "integer" },
          { field: "unitsDefective", label: "Defective units", format: "integer" },
          { field: "defectRate", label: "Defect rate", format: "percent" },
        ],
      },
    ],
  },
  {
    id: "highest-defect-lines",
    organizationId: "northstar",
    text: "Which production lines have the highest defect rates?",
    title: "Defect rates by production line",
    assumptions: ['The window is the most recent complete quarter, so that results line up with the production view.'],
    subtitle: () => periodLabel(quarter().from, quarter().to),
    plan: () => [
      {
        key: "defects",
        capabilityId: "northstar.defect_rates",
        input: { dateFrom: quarter().from, dateTo: quarter().to },
        rationale: "Ranks every visible line by defect rate for the window.",
      },
    ],
    compose: () => [
      {
        type: "Narrative",
        id: "summary",
        template:
          "{{results.defects.summary.worstLineLabel|text}} has the highest defect rate at {{results.defects.summary.worstLineRate|percent}}, against {{results.defects.summary.overallDefectRate|percent}} overall.",
      },
      { type: "KpiCard", id: "kpi-worst", title: "Highest line defect rate", dataRef: "results.defects.summary.worstLineRate", format: "percent" },
      { type: "KpiCard", id: "kpi-overall", title: "Overall defect rate", dataRef: "results.defects.summary.overallDefectRate", format: "percent" },
      { type: "BarChart", id: "defects-by-line", title: "Defect rate by line", dataRef: "results.defects.rows", xField: "label", yField: "defectRate", format: "percent" },
      {
        type: "DataTable",
        id: "line-table",
        title: "Line detail",
        dataRef: "results.defects.rows",
        columns: [
          { field: "label", label: "Line" },
          { field: "factory", label: "Factory" },
          { field: "unitsProduced", label: "Units produced", format: "integer" },
          { field: "defectRate", label: "Defect rate", format: "percent" },
        ],
      },
    ],
  },
  {
    id: "downtime-comparison",
    organizationId: "northstar",
    text: "Compare downtime this month with last month and show the biggest contributors.",
    title: "Downtime: this month against last month",
    assumptions: [
      '"This month" runs from the first of the month to the dataset reference date; "last month" is the previous full month.',
    ],
    subtitle: () => `${monthLabel(thisMonth(REFERENCE_DATE).from.slice(0, 7))} against ${monthLabel(lastMonth(REFERENCE_DATE).from.slice(0, 7))}`,
    plan: () => [
      {
        key: "downtime",
        capabilityId: "northstar.downtime_breakdown",
        input: {
          dateFrom: thisMonth(REFERENCE_DATE).from,
          dateTo: thisMonth(REFERENCE_DATE).to,
          compareFrom: lastMonth(REFERENCE_DATE).from,
          compareTo: lastMonth(REFERENCE_DATE).to,
        },
        rationale: "Sums downtime by cause in both periods and ranks causes by growth.",
      },
    ],
    compose: () => [
      {
        type: "Narrative",
        id: "summary",
        template:
          "Downtime was {{results.downtime.summary.totalMinutes|minutes}} this month, compared with {{results.downtime.summary.previousMinutes|minutes}} last month, a change of {{results.downtime.summary.changePct|percent}}. The largest increase came from {{results.downtime.summary.topIncreaseCause|text}}.",
      },
      { type: "KpiCard", id: "kpi-this", title: "Downtime this month", dataRef: "results.downtime.summary.totalMinutes", format: "minutes" },
      { type: "KpiCard", id: "kpi-last", title: "Downtime last month", dataRef: "results.downtime.summary.previousMinutes", format: "minutes" },
      { type: "BarChart", id: "delta-by-cause", title: "Change in downtime by cause", dataRef: "results.downtime.rows", xField: "cause", yField: "deltaMinutes", format: "minutes" },
      { type: "DonutChart", id: "share-by-cause", title: "Downtime this month by cause", dataRef: "results.downtime.rows", nameField: "cause", valueField: "minutes", format: "minutes" },
      {
        type: "DataTable",
        id: "cause-table",
        title: "Cause detail",
        dataRef: "results.downtime.rows",
        columns: [
          { field: "cause", label: "Cause" },
          { field: "minutes", label: "This month", format: "minutes" },
          { field: "previousMinutes", label: "Last month", format: "minutes" },
          { field: "deltaMinutes", label: "Change", format: "minutes" },
        ],
      },
    ],
  },
];

export function getCuratedPrompt(id: string): CuratedPrompt | undefined {
  return curatedPrompts.find((p) => p.id === id);
}

export class RunError extends Error {}

export interface CuratedRun {
  experience: ExperienceSpec;
  envelope: Envelope;
  trace: Trace;
}

function treeOf(spec: ExperienceSpec): Trace["experience"] {
  return {
    componentCount: spec.components.length,
    tree: spec.components.map((c) => ({ id: c.id, type: c.type, ...("dataRef" in c ? { dataRef: c.dataRef } : {}) })),
  };
}

/** The non-AI path: a fixed intent mapping that still goes through real policy, services and validation. */
export async function runCurated(session: Session, promptId: string): Promise<CuratedRun> {
  const prompt = getCuratedPrompt(promptId);
  if (!prompt || prompt.organizationId !== session.organizationId) throw new RunError("Unknown prompt");
  if (!getOrganization(session.organizationId)?.available) throw new RunError("Organization not available");

  const calls = prompt.plan();
  const envelope: Envelope = { results: {} };
  const executions: ExecutionRecord[] = [];
  const decisions: Decision[] = calls.map((c) => ({
    capabilityId: c.capabilityId,
    rationale: c.rationale,
    source: "curated",
  }));

  for (const call of calls) {
    const outcome = await executeCapability(session, call.capabilityId, call.input);
    executions.push(outcome.record);
    if (outcome.result) envelope.results[call.key] = outcome.result.data;
  }

  const failed = executions.some((e) => e.status !== "ok");
  const narrowed = executions.some((e) => e.policyChecks.some((c) => c.status === "narrowed"));

  const components: ExperienceComponent[] = failed
    ? [
        { type: "Notice", id: "blocked", level: "warning", text: "This request could not be completed for the selected role." },
        { type: "EmptyState", id: "empty", title: "Nothing to show", text: "The policy layer blocked a required service call. See how PAA handled it in the inspector." },
      ]
    : [
        ...(narrowed
          ? [{ type: "Notice" as const, id: "scope", level: "info" as const, text: "Results are limited to the data this role is permitted to see." }]
          : []),
        ...prompt.compose(),
      ];

  const candidate = {
    version: "1",
    title: prompt.title,
    components: [
      { type: "PageHeading", id: "heading", text: prompt.title, subtitle: failed ? undefined : prompt.subtitle() },
      ...components,
    ],
  };

  const validated = validateExperience(candidate, envelope);
  if (!validated.ok) throw new RunError(`Composed experience failed validation: ${validated.errors.join("; ")}`);

  return {
    experience: validated.spec,
    envelope,
    trace: {
      organizationId: session.organizationId,
      roleId: session.roleId,
      promptId,
      intent: { text: prompt.text, assumptions: prompt.assumptions },
      decisions,
      executions,
      experience: treeOf(validated.spec),
    },
  };
}
