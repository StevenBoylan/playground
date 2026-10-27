import { z } from "zod";
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
});

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
