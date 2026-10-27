import { getCapability } from "../capabilities/registry";
import { getOrganization } from "../organizations";
import type { Envelope } from "../schemas/bindings";
import type { Session } from "../schemas/capability";
import { validateExperience, type ExperienceComponent, type ExperienceSpec } from "../schemas/experience";
import type { Decision, Trace } from "../schemas/trace";
import { blockedComponents, executePlan, PlanError, scopeNotice, type PlanExecution, type PlannedCall } from "./execute";
import { ModelError, type ModelAdapter } from "./model-adapter";
import { candidateExperience, plannedCalls, type ModelPlan } from "./plan";
import type { PlanContext } from "./prompt";

export const DEFAULT_MODEL_TIMEOUT_MS = 45_000;

/** Real progress events, emitted as the corresponding work starts. */
export type IntentEvent =
  | { stage: "understanding" }
  | { stage: "fetching"; capabilities: string[] }
  | { stage: "composing" }
  | { stage: "repairing" };

export type IntentResult =
  | { kind: "experience"; experience: ExperienceSpec; envelope: Envelope; calls: PlannedCall[]; trace: Trace }
  | { kind: "message"; status: "clarify" | "unsupported"; message: string; trace: Trace }
  | { kind: "error"; message: string };

export interface IntentOptions {
  session: Session;
  text: string;
  context?: PlanContext;
  adapter: ModelAdapter;
  onEvent?: (event: IntentEvent) => void;
  timeoutMs?: number;
}

const FRIENDLY_FAILURE =
  "I couldn't build a reliable view for that request. Try rephrasing it, or pick one of the suggested requests.";

/** FilterBars must only offer inputs the planned call really accepts. */
function checkFilterBars(components: ExperienceComponent[], calls: PlannedCall[]): string[] {
  const errors: string[] = [];
  for (const c of components) {
    if (c.type !== "FilterBar") continue;
    for (const filter of c.filters) {
      const call = calls.find((p) => p.key === filter.callKey);
      if (!call) {
        errors.push(`${c.id}: filter callKey "${filter.callKey}" is not one of the planned calls`);
        continue;
      }
      if (!getCapability(call.capabilityId)?.inputKeys.includes(filter.param)) {
        errors.push(`${c.id}: ${call.capabilityId} does not accept "${filter.param}"`);
      }
    }
  }
  return errors;
}

function treeOf(spec: ExperienceSpec): Trace["experience"] {
  return {
    componentCount: spec.components.length,
    tree: spec.components.map((c) => ({ id: c.id, type: c.type, ...("dataRef" in c ? { dataRef: c.dataRef } : {}) })),
  };
}

function baseTrace(session: Session, text: string, plan: ModelPlan): Trace {
  const decisions: Decision[] = plan.calls.map((c) => ({
    capabilityId: c.capabilityId,
    rationale: c.rationale,
    source: "model_stated",
  }));
  return {
    organizationId: session.organizationId,
    roleId: session.roleId,
    promptId: "free-text",
    intent: { text: plan.intent || text, assumptions: plan.assumptions },
    decisions,
    executions: [],
    experience: { componentCount: 0, tree: [] },
  };
}

interface Attempt {
  calls: PlannedCall[];
  execution: PlanExecution;
  candidate: unknown;
  errors: string[];
}

/** Executes a plan and validates its layout against what the services actually returned. */
async function attempt(session: Session, plan: ModelPlan): Promise<Attempt> {
  const calls = plannedCalls(plan);
  const execution = await executePlan(session, calls);
  const errors: string[] = [];

  // A call rejected for bad input is something the model can fix; a policy denial is not.
  for (const [i, record] of execution.executions.entries()) {
    if (record.status === "error") errors.push(`call "${calls[i].key}" (${record.capabilityId}): ${record.error}`);
  }
  if (errors.length > 0 || execution.failed) return { calls, execution, candidate: undefined, errors };

  const candidate = candidateExperience(plan);
  if (candidate === undefined) return { calls, execution, candidate, errors: ["The plan has no experience"] };

  const validated = validateExperience(candidate, execution.envelope);
  if (!validated.ok) errors.push(...validated.errors);
  else errors.push(...checkFilterBars(validated.spec.components, calls));
  return { calls, execution, candidate, errors };
}

/**
 * The live path. The model proposes calls and a layout; everything it proposes is authorized, executed,
 * validated and recorded by the backend before the visitor sees anything. One repair round is allowed.
 */
export async function runIntent(options: IntentOptions): Promise<IntentResult> {
  const { session, text, context, adapter, onEvent } = options;
  const org = getOrganization(session.organizationId);
  if (!org?.available) return { kind: "error", message: "That company isn't available yet." };

  const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_MODEL_TIMEOUT_MS);
  const ask = async (repair?: { previous: ModelPlan; errors: string[] }): Promise<ModelPlan | IntentResult> => {
    try {
      return await adapter.plan({ organizationId: session.organizationId, text, context, repair }, signal);
    } catch (error) {
      if (error instanceof ModelError) return { kind: "error", message: error.message };
      console.error("[paa] unexpected model failure:", error);
      return { kind: "error", message: "Something went wrong while planning. Please try again." };
    }
  };
  const failed = (r: ModelPlan | IntentResult): r is IntentResult => "kind" in r;

  onEvent?.({ stage: "understanding" });
  let plan = await ask();
  if (failed(plan)) return plan;

  if (plan.status !== "ok") {
    const message =
      plan.message?.trim() ||
      (plan.status === "clarify" ? "Could you tell me a bit more about what you'd like to see?" : "That's outside what this demo can answer.");
    return { kind: "message", status: plan.status, message, trace: baseTrace(session, text, plan) };
  }

  let firstErrors: string[] = [];
  let repaired = false;
  let result: Attempt | undefined;

  for (let round = 0; round < 2; round++) {
    onEvent?.({ stage: "fetching", capabilities: plan.calls.map((c) => c.capabilityId) });
    try {
      result = await attempt(session, plan);
    } catch (error) {
      if (!(error instanceof PlanError)) throw error;
      result = { calls: [], execution: { envelope: { results: {} }, executions: [], failed: true, narrowed: false }, candidate: undefined, errors: [error.message] };
    }
    onEvent?.({ stage: "composing" });

    const denied = result.execution.executions.some((e) => e.status === "denied");
    if (result.errors.length === 0 || denied) break;

    if (round === 1) break;
    firstErrors = result.errors;
    repaired = true;
    onEvent?.({ stage: "repairing" });
    const next = await ask({ previous: plan, errors: result.errors });
    if (failed(next)) return next;
    if (next.status !== "ok") {
      return { kind: "message", status: next.status, message: next.message?.trim() || FRIENDLY_FAILURE, trace: baseTrace(session, text, next) };
    }
    plan = next;
  }

  if (!result) return { kind: "error", message: FRIENDLY_FAILURE };

  const { calls, execution } = result;
  const trace: Trace = {
    ...baseTrace(session, text, plan),
    executions: execution.executions,
    validation: { repaired, firstErrors },
  };

  // A policy denial yields an honest blocked view, never fabricated data.
  if (execution.executions.some((e) => e.status === "denied")) {
    const blocked = validateExperience(
      {
        version: "1",
        title: plan.experience?.title ?? "Request blocked",
        components: [{ type: "PageHeading", id: "heading", text: plan.experience?.title ?? "Request blocked" }, ...blockedComponents()],
      },
      execution.envelope,
    );
    if (!blocked.ok) return { kind: "error", message: FRIENDLY_FAILURE };
    trace.experience = treeOf(blocked.spec);
    return { kind: "experience", experience: blocked.spec, envelope: execution.envelope, calls, trace };
  }

  if (result.errors.length > 0) {
    console.warn("[paa] composed view rejected:", result.errors.join(" | "));
    trace.experience = { componentCount: 0, tree: [] };
    trace.validation = { repaired, firstErrors: result.errors };
    return { kind: "error", message: FRIENDLY_FAILURE };
  }

  const validated = validateExperience(result.candidate, execution.envelope);
  if (!validated.ok) return { kind: "error", message: FRIENDLY_FAILURE };

  // Policy narrowing is a system fact, so it is shown whether or not the model mentioned it.
  let spec = validated.spec;
  if (execution.narrowed && !spec.components.some((c) => c.type === "Notice" && c.id === "scope")) {
    const components = [spec.components[0], scopeNotice(), ...spec.components.slice(1)];
    const withNotice = validateExperience({ ...spec, components }, execution.envelope);
    if (withNotice.ok) spec = withNotice.spec;
  }
  trace.experience = treeOf(spec);
  return { kind: "experience", experience: spec, envelope: execution.envelope, calls, trace };
}
