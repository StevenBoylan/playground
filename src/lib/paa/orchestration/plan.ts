import { z } from "zod";
import { DOC_KINDS } from "../documents/types";
import { FORMATS } from "../format";
import { FILTER_PARAMS, type ExperienceSpec } from "../schemas/experience";
import type { PlannedCall } from "./execute";

/**
 * What the model is asked to produce. This is deliberately lean (no regexes or length limits) so it is
 * accepted as a structured-output schema; the strict schemas in schemas/experience.ts and each capability's
 * input schema do the real validation afterwards. The model proposes; the backend disposes.
 */
const format = z.enum(FORMATS);
const column = z.strictObject({ field: z.string(), label: z.string(), format: format.optional() });

const modelComponent = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("PageHeading"), id: z.string(), text: z.string(), subtitle: z.string().optional() }),
  z.strictObject({ type: z.literal("Narrative"), id: z.string(), template: z.string() }),
  z.strictObject({ type: z.literal("KpiCard"), id: z.string(), title: z.string(), dataRef: z.string(), format }),
  z.strictObject({
    type: z.literal("LineChart"),
    id: z.string(),
    title: z.string(),
    dataRef: z.string(),
    xField: z.string(),
    yField: z.string(),
    format: format.optional(),
  }),
  z.strictObject({
    type: z.literal("BarChart"),
    id: z.string(),
    title: z.string(),
    dataRef: z.string(),
    xField: z.string(),
    yField: z.string(),
    format: format.optional(),
  }),
  z.strictObject({
    type: z.literal("DonutChart"),
    id: z.string(),
    title: z.string(),
    dataRef: z.string(),
    nameField: z.string(),
    valueField: z.string(),
    format: format.optional(),
  }),
  z.strictObject({
    type: z.literal("DataTable"),
    id: z.string(),
    title: z.string(),
    dataRef: z.string(),
    columns: z.array(column),
  }),
  z.strictObject({
    type: z.literal("Comparison"),
    id: z.string(),
    title: z.string(),
    currentLabel: z.string(),
    previousLabel: z.string(),
    currentRef: z.string(),
    previousRef: z.string(),
    format,
    higherIs: z.enum(["good", "bad", "neutral"]),
  }),
  z.strictObject({
    type: z.literal("FilterBar"),
    id: z.string(),
    filters: z.array(
      z.strictObject({
        param: z.enum(FILTER_PARAMS),
        label: z.string(),
        callKey: z.string(),
        options: z.array(z.strictObject({ value: z.string(), label: z.string() })),
      }),
    ),
  }),
  z.strictObject({ type: z.literal("Notice"), id: z.string(), level: z.enum(["info", "warning"]), text: z.string() }),
  z.strictObject({ type: z.literal("EmptyState"), id: z.string(), title: z.string(), text: z.string() }),
]);

const callInput = z.strictObject({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  compareFrom: z.string().optional(),
  compareTo: z.string().optional(),
  groupBy: z.string().optional(),
  granularity: z.string().optional(),
  factoryId: z.string().optional(),
  lineId: z.string().optional(),
  cause: z.string().optional(),
  // Orbit
  asOf: z.string().optional(),
  planId: z.string().optional(),
  segment: z.string().optional(),
  feature: z.string().optional(),
  category: z.string().optional(),
  limit: z.number().optional(),
  // Grove
  department: z.string().optional(),
  course: z.string().optional(),
  type: z.string().optional(),
});

const deliverableBlock = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("heading"), text: z.string() }),
  z.strictObject({ type: z.literal("paragraph"), template: z.string() }),
  z.strictObject({ type: z.literal("bullets"), items: z.array(z.string()) }),
  z.strictObject({ type: z.literal("kpi"), title: z.string(), dataRef: z.string(), format }),
  z.strictObject({
    type: z.literal("chart"),
    chart: z.enum(["bar", "line", "donut"]),
    title: z.string(),
    dataRef: z.string(),
    xField: z.string(),
    yField: z.string(),
    format: format.optional(),
  }),
  z.strictObject({ type: z.literal("table"), title: z.string(), dataRef: z.string(), columns: z.array(column) }),
]);

export const ModelPlanSchema = z.strictObject({
  status: z.enum(["ok", "clarify", "unsupported"]),
  /** For "clarify" and "unsupported": the message shown to the visitor. */
  message: z.string().optional(),
  /** One-sentence interpretation of what the visitor wants. */
  intent: z.string(),
  assumptions: z.array(z.string()),
  calls: z.array(
    z.strictObject({
      key: z.string(),
      capabilityId: z.string(),
      /** Why this capability is relevant. Shown in the inspector as the model's stated rationale. */
      rationale: z.string(),
      input: callInput,
    }),
  ),
  experience: z.strictObject({ title: z.string(), components: z.array(modelComponent) }).optional(),
  /** A document to produce: a PDF or slide deck file, or a simulated email draft. Validated strictly downstream. */
  deliverable: z
    .strictObject({
      kind: z.enum(DOC_KINDS),
      title: z.string(),
      subtitle: z.string().optional(),
      /** Email only: display names such as "Leadership team". Nothing is ever sent. */
      to: z.array(z.string()).optional(),
      subject: z.string().optional(),
      blocks: z.array(deliverableBlock),
    })
    .optional(),
});

export type ModelPlan = z.infer<typeof ModelPlanSchema>;

/** Drops empty values the model may emit so capability schemas see only real inputs. */
export function cleanInput(input: ModelPlan["calls"][number]["input"]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== null && v !== ""));
}

export function plannedCalls(plan: ModelPlan): PlannedCall[] {
  return plan.calls.map((c) => ({ key: c.key, capabilityId: c.capabilityId, input: cleanInput(c.input) }));
}

/** The candidate UI spec, still untrusted: it must pass validateExperience before anything renders. */
export function candidateExperience(plan: ModelPlan): unknown {
  if (!plan.experience) return undefined;
  return { version: "1", title: plan.experience.title, components: plan.experience.components } satisfies Omit<
    ExperienceSpec,
    "components"
  > & { components: unknown[] };
}

/** Removes null values the model may emit for optional fields, at any depth. */
function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== null).map(([k, v]) => [k, stripNulls(v)]));
  }
  return value;
}

/** Finds the JSON object in a model reply, tolerating markdown fences or a stray sentence around it. */
function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object found");
  return JSON.parse(text.slice(start, end + 1));
}

export type ParsedPlan = { ok: true; plan: ModelPlan } | { ok: false; error: string };

/** Parses and validates a model reply as a plan. The strict schemas elsewhere still gate what is run or shown. */
export function parsePlanText(text: string): ParsedPlan {
  let raw: unknown;
  try {
    raw = extractJsonObject(text);
  } catch (error) {
    return { ok: false, error: `The reply was not valid JSON (${error instanceof Error ? error.message : "parse error"}).` };
  }
  const parsed = ModelPlanSchema.safeParse(stripNulls(raw));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ") };
  }
  return { ok: true, plan: parsed.data };
}
