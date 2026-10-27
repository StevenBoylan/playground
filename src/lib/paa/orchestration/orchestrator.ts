import { actionCapability, applyBranding, brandingCapability, runAction, type BrandingDecision } from "../actions/run";
import { authorizeAccess } from "../policies/authorize";
import { getCapability } from "../capabilities/registry";
import { brandFor } from "../documents/brand";
import { resolveDeliverable } from "../documents/resolve";
import type { Deliverable, DocKind, ResolvedDocument } from "../documents/types";
import { entityNames, getOrganization } from "../organizations";
import type { Envelope } from "../schemas/bindings";
import type { Session } from "../schemas/capability";
import { ExperienceSchema, type ExperienceComponent, type ExperienceSpec } from "../schemas/experience";
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
      /** The composed layout, present only when the data was blocked and the experience shown is a blocked view. */
      base?: ExperienceSpec;
      envelope: Envelope;
      calls: PlannedCall[];
      trace: Trace;
      deliverables?: Deliverable[];
      /** Set when a requested document was blocked or failed; safe to show. */
      actionError?: string;
    }
  /** Documents were requested without a new view (for example "make slides saying ..."). */
  | { kind: "deliverable"; deliverables?: Deliverable[]; actionError?: string; trace: Trace }
  /** `expects` is set when the question is one the client can answer without a model, such as the branding choice. */
  | { kind: "message"; status: "clarify" | "unsupported"; message: string; trace: Trace; expects?: "branding" }
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

const FILE_KINDS: DocKind[] = ["pdf", "pptx"];
const KIND_NOUN: Record<string, string> = { pdf: "PDF", pptx: "slide deck" };

/** "this PDF", "this slide deck" or "these documents": the thing the branding question is about. */
function brandingSubject(kinds: DocKind[]): string {
  const files = FILE_KINDS.filter((k) => kinds.includes(k));
  return files.length === 1 ? `this ${KIND_NOUN[files[0]]}` : "these documents";
}

const BRANDING_STATED = /\b(brand\w*|unbranded|plain|logo|house style|company (style|colou?rs?))\b/i;

/** Which file documents a request's own words ask for, found before the model is spent on it. */
function requestedFiles(text: string): DocKind[] {
  const kinds: DocKind[] = [];
  if (/\bpdf\b/i.test(text)) kinds.push("pdf");
  if (/\b(slides?|deck|powerpoint|pptx)\b/i.test(text)) kinds.push("pptx");
  return kinds;
}

function emptyTrace(session: Session, text: string): Trace {
  return {
    organizationId: session.organizationId,
    roleId: session.roleId,
    promptId: "free-text",
    intent: { text, assumptions: [] },
    decisions: [],
    executions: [],
    experience: { componentCount: 0, tree: [] },
  };
}

/** The branding skill is only offered to roles that hold it; everyone else simply gets plain documents. */
function mayBrand(session: Session): boolean {
  return authorizeAccess(session, brandingCapability(session.organizationId)).allowed;
}

const SAYS_BRANDED = /\b(branded|with (our |the |my )?branding|company (style|colou?rs?)|logo|house style)\b/i;
const SAYS_PLAIN = /\b(unbranded|plain|no branding|without (any )?branding|not branded)\b/i;

/**
 * Whether a plan's documents should carry the company's branding: what the model recorded, else what the visitor's
 * words say, else the default. Email on its own is branded unless told otherwise; files are plain unless asked.
 */
function wantsBranding(plan: ModelPlan, text: string): boolean {
  const docs = plan.deliverables ?? [];
  if (docs.some((d) => d.branded === true)) return true;
  if (docs.some((d) => d.branded === false)) return false;
  if (SAYS_PLAIN.test(text)) return false;
  if (SAYS_BRANDED.test(text)) return true;
  return docs.length > 0 && docs.every((d) => d.kind === "email");
}

/** Files first and the email last, so the email can carry what was produced as attachments. */
function inDeliveryOrder<T extends { kind: DocKind }>(docs: T[]): T[] {
  return [...docs.filter((d) => d.kind !== "email"), ...docs.filter((d) => d.kind === "email")];
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
  documents: ResolvedDocument[];
  branding: BrandingDecision;
  errors: string[];
}

const NO_BRANDING: BrandingDecision = { branded: false };

const EMPTY_EXECUTION: PlanExecution = { envelope: { results: {} }, executions: [], failed: false, narrowed: false };

/** Executes a plan, then validates its layout and any requested document against what the services returned. */
async function attempt(session: Session, plan: ModelPlan, text: string): Promise<Attempt> {
  const branding = plan.deliverables?.length ? applyBranding(session, wantsBranding(plan, text)) : NO_BRANDING;
  const calls = plannedCalls(plan);
  // A deliverable that needs no data (for example slides with supplied text) may plan zero calls.
  const execution = calls.length === 0 && plan.deliverables?.length ? EMPTY_EXECUTION : await executePlan(session, calls);
  const errors: string[] = [];

  // A call rejected for bad input is something the model can fix; a policy denial is not.
  for (const [i, record] of execution.executions.entries()) {
    if (record.status === "error") errors.push(`call "${calls[i].key}" (${record.capabilityId}): ${record.error}`);
  }
  if (errors.length > 0 || execution.failed) return { calls, execution, candidate: undefined, documents: [], branding, errors };

  const candidate = candidateExperience(plan);
  if (candidate === undefined && !plan.deliverables?.length) {
    return { calls, execution, candidate, documents: [], branding, errors: ["The plan has neither an experience nor a deliverable"] };
  }
  if (candidate !== undefined) {
    const validated = validateForOrganization(session.organizationId, candidate, execution.envelope);
    if (!validated.ok) errors.push(...validated.errors);
    else errors.push(...checkFilterBars(validated.spec.components, calls));
  }

  const documents: ResolvedDocument[] = [];
  const brand = brandFor(session.organizationId, branding.branded);
  for (const [i, spec] of inDeliveryOrder(plan.deliverables ?? []).entries()) {
    const resolved = resolveDeliverable(spec, execution.envelope, {
      brand,
      allowedNames: entityNames(session.organizationId),
      verbatimSource: text,
    });
    if (resolved.ok) documents.push(resolved.document);
    else errors.push(...resolved.errors.map((e) => (plan.deliverables!.length > 1 ? `document ${i + 1}: ${e}` : e)));
  }
  return { calls, execution, candidate, documents, branding, errors };
}

/**
 * The live path. The model proposes calls, a layout and optionally a document; everything it proposes is
 * authorized, executed, validated and recorded by the backend before the visitor sees anything.
 * One repair round is allowed.
 */
function brandingQuestion(trace: Trace, kinds: DocKind[]): IntentResult {
  return { kind: "message", status: "clarify", message: `Do you want ${brandingSubject(kinds)} branded?`, trace, expects: "branding" };
}

export async function runIntent(options: IntentOptions): Promise<IntentResult> {
  const { session, text, context, adapter, onEvent } = options;
  const org = getOrganization(session.organizationId);
  if (!org?.available) return { kind: "error", message: "That company isn't available yet." };

  // The branding skill asks first. When the request itself names a PDF or deck without saying either way,
  // the question is asked before any model call is spent.
  const askedFiles = requestedFiles(text);
  if (askedFiles.length > 0 && !BRANDING_STATED.test(text) && mayBrand(session)) {
    return brandingQuestion(emptyTrace(session, text), askedFiles);
  }

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

  // Safety net for requests that only imply a document ("send them a report"): ask before building anything.
  const plannedFiles = (plan.deliverables ?? []).filter((d) => FILE_KINDS.includes(d.kind));
  if (plannedFiles.some((d) => d.branded === undefined) && !BRANDING_STATED.test(text) && mayBrand(session)) {
    return brandingQuestion(baseTrace(session, text, plan), plannedFiles.map((d) => d.kind));
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
      result = { calls: [], execution: { envelope: { results: {} }, executions: [], failed: true, narrowed: false }, candidate: undefined, documents: [], branding: NO_BRANDING, errors: [error.message] };
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
    const composed = candidateExperience(plan) === undefined ? undefined : ExperienceSchema.safeParse(candidateExperience(plan));
    return { kind: "experience", experience: blocked.spec, ...(composed?.success ? { base: composed.data } : {}), envelope: execution.envelope, calls, trace };
  }

  if (result.errors.length > 0) {
    console.warn("[paa] composed view rejected:", result.errors.join(" | "));
    trace.experience = { componentCount: 0, tree: [] };
    trace.validation = { repaired, firstErrors: result.errors };
    return { kind: "error", message: FRIENDLY_FAILURE };
  }

  // The requested documents, if any, only now pass through each action's own policy check, files first.
  const deliverables: Deliverable[] = [];
  const actionErrors: string[] = [];
  if (result.documents.length > 0) {
    if (result.branding.record) {
      trace.executions.push(result.branding.record);
      trace.decisions.push({
        capabilityId: brandingCapability(session.organizationId).id,
        rationale: "The visitor asked for the company's branding on the documents in this request.",
        source: "curated",
      });
      if (result.branding.record.status === "denied") actionErrors.push("Your current role isn't permitted to apply company branding, so the documents are plain.");
    }
    trace.deliverables = [];
    for (const document of result.documents) {
      onEvent?.({ stage: "generating", kind: document.kind });
      if (document.email) {
        document.email.attachments = deliverables.flatMap((d) => (d.file && (d.kind === "pdf" || d.kind === "pptx") ? [{ filename: d.file.filename, kind: d.kind }] : []));
      }
      const action = await runAction(session, document);
      trace.executions.push(action.record);
      trace.decisions.push({
        capabilityId: actionCapability(session.organizationId, document.kind).id,
        rationale: `Produces the requested ${document.kind === "email" ? "email draft" : document.kind.toUpperCase()} from the validated results.`,
        source: "curated",
      });
      trace.deliverables.push({ kind: document.kind, title: document.title, blockCount: document.blocks.length });
      if (action.deliverable) deliverables.push(action.deliverable);
      if (action.record.status !== "ok") actionErrors.push(actionFailureMessage(document.kind, action.record.status));
    }
  }
  const actionError = actionErrors.length > 0 ? actionErrors.join(" ") : undefined;

  if (result.candidate === undefined) return { kind: "deliverable", deliverables, actionError, trace };

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
  return { kind: "experience", experience: spec, envelope: execution.envelope, calls, trace, deliverables, actionError };
}
