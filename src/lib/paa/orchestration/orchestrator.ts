import { actionCapability, runAction } from "../actions/run";
import { getCapability } from "../capabilities/registry";
import { brandFor } from "../documents/brand";
import { resolveDeliverable } from "../documents/resolve";
import type { Deliverable, DocKind, ResolvedDocument } from "../documents/types";
import { entityNames, getOrganization } from "../organizations";
import type { Envelope } from "../schemas/bindings";
import type { Session } from "../schemas/capability";
import type { ExperienceComponent, ExperienceSpec } from "../schemas/experience";
import type { Decision, Trace } from "../schemas/trace";
import {
  blockedComponents,
  executePlan,
  PlanError,
  scopeNotice,
  validateForOrganization,
  type PlanExecution,
  type PlannedCall,
} from "./execute";
import { ModelError, type ModelAdapter } from "./model-adapter";
import { candidateExperience, plannedCalls, type ModelPlan } from "./plan";
import type { PlanContext } from "./prompt";

export const DEFAULT_MODEL_TIMEOUT_MS = 45_000;

/** Real progress events, emitted as the corresponding work starts. */
export type IntentEvent =
  | { stage: "understanding" }
  | { stage: "fetching"; capabilities: string[] }
  | { stage: "composing" }
  | { stage: "repairing" }
  | { stage: "generating"; kind: DocKind };

export type IntentResult =
  | {
      kind: "experience";
      experience: ExperienceSpec;
      envelope: Envelope;
      calls: PlannedCall[];
      trace: Trace;
      deliverable?: Deliverable;
      /** Set when a requested document was blocked or failed; safe to show. */
      actionError?: string;
    }
  /** A document was requested without a new view (for example "make slides saying ..."). */
  | { kind: "deliverable"; deliverable?: Deliverable; actionError?: string; trace: Trace }
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

const ACTION_PHRASE: Record<DocKind, string> = {
  pdf: "export PDF reports",
  pptx: "build slide decks",
  email: "draft emails",
};

/** The message shown when a document action did not run. Policy detail stays in the inspector. */
export function actionFailureMessage(kind: DocKind, status: "denied" | "error"): string {
  return status === "denied"
    ? `Your current role isn't permitted to ${ACTION_PHRASE[kind]}. The policy layer blocked the action before anything was generated.`
    : "The document could not be generated. Please try again.";
}

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
  document?: ResolvedDocument;
  errors: string[];
}

const EMPTY_EXECUTION: PlanExecution = { envelope: { results: {} }, executions: [], failed: false, narrowed: false };

/** Executes a plan, then validates its layout and any requested document against what the services returned. */
async function attempt(session: Session, plan: ModelPlan, text: string): Promise<Attempt> {
  const calls = plannedCalls(plan);
  // A deliverable that needs no data (for example slides with supplied text) may plan zero calls.
  const execution = calls.length === 0 && plan.deliverable ? EMPTY_EXECUTION : await executePlan(session, calls);
  const errors: string[] = [];

  // A call rejected for bad input is something the model can fix; a policy denial is not.
  for (const [i, record] of execution.executions.entries()) {
    if (record.status === "error") errors.push(`call "${calls[i].key}" (${record.capabilityId}): ${record.error}`);
  }
  if (errors.length > 0 || execution.failed) return { calls, execution, candidate: undefined, errors };

  const candidate = candidateExperience(plan);
  if (candidate === undefined && !plan.deliverable) {
    return { calls, execution, candidate, errors: ["The plan has neither an experience nor a deliverable"] };
  }
  if (candidate !== undefined) {
    const validated = validateForOrganization(session.organizationId, candidate, execution.envelope);
    if (!validated.ok) errors.push(...validated.errors);
    else errors.push(...checkFilterBars(validated.spec.components, calls));
  }

  let document: ResolvedDocument | undefined;
  if (plan.deliverable) {
    const resolved = resolveDeliverable(plan.deliverable, execution.envelope, {
      brand: brandFor(session.organizationId),
      allowedNames: entityNames(session.organizationId),
      verbatimSource: text,
    });
    if (resolved.ok) document = resolved.document;
    else errors.push(...resolved.errors);
  }
  return { calls, execution, candidate, document, errors };
}

/**
 * The live path. The model proposes calls, a layout and optionally a document; everything it proposes is
 * authorized, executed, validated and recorded by the backend before the visitor sees anything.
 * One repair round is allowed.
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
    if (plan.calls.length > 0) onEvent?.({ stage: "fetching", capabilities: plan.calls.map((c) => c.capabilityId) });
    try {
      result = await attempt(session, plan, text);
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
    executions: [...execution.executions],
    validation: { repaired, firstErrors },
  };

  // A policy denial yields an honest blocked view, never fabricated data.
  if (execution.executions.some((e) => e.status === "denied")) {
    const blocked = validateForOrganization(
      session.organizationId,
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

  // The requested document, if any, only now passes through the action's own policy check.
  let deliverable: Deliverable | undefined;
  let actionError: string | undefined;
  if (result.document) {
    onEvent?.({ stage: "generating", kind: result.document.kind });
    const action = await runAction(session, result.document);
    trace.executions.push(action.record);
    trace.decisions.push({
      capabilityId: actionCapability(session.organizationId, result.document.kind).id,
      rationale: `Produces the requested ${result.document.kind === "email" ? "email draft" : result.document.kind.toUpperCase()} from the validated results.`,
      source: "curated",
    });
    trace.deliverable = { kind: result.document.kind, title: result.document.title, blockCount: result.document.blocks.length };
    deliverable = action.deliverable;
    if (action.record.status !== "ok") actionError = actionFailureMessage(result.document.kind, action.record.status);
  }

  if (result.candidate === undefined) return { kind: "deliverable", deliverable, actionError, trace };

  const validated = validateForOrganization(session.organizationId, result.candidate, execution.envelope);
  if (!validated.ok) return { kind: "error", message: FRIENDLY_FAILURE };

  // Policy narrowing is a system fact, so it is shown whether or not the model mentioned it.
  let spec = validated.spec;
  if (execution.narrowed && !spec.components.some((c) => c.type === "Notice" && c.id === "scope")) {
    const components = [spec.components[0], scopeNotice(), ...spec.components.slice(1)];
    const withNotice = validateForOrganization(session.organizationId, { ...spec, components }, execution.envelope);
    if (withNotice.ok) spec = withNotice.spec;
  }
  trace.experience = treeOf(spec);
  return { kind: "experience", experience: spec, envelope: execution.envelope, calls, trace, deliverable, actionError };
}
