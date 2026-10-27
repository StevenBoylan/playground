import { executeCapability } from "../capabilities/registry";
import type { Envelope } from "../schemas/bindings";
import { CALL_KEY_PATTERN, type ExperienceComponent } from "../schemas/experience";
import type { Session } from "../schemas/capability";
import type { ExecutionRecord } from "../schemas/trace";

export const MAX_CALLS = 4;

export interface PlannedCall {
  key: string;
  capabilityId: string;
  /** Inputs as requested, before policy narrowing, so the same plan can be re-run under another role. */
  input: Record<string, unknown>;
}

export class PlanError extends Error {}

export interface PlanExecution {
  envelope: Envelope;
  executions: ExecutionRecord[];
  failed: boolean;
  narrowed: boolean;
}

/** Runs every planned call through authorization, validation and the service, recording what happened. */
export async function executePlan(session: Session, calls: PlannedCall[]): Promise<PlanExecution> {
  if (calls.length === 0) throw new PlanError("No capability calls were planned");
  if (calls.length > MAX_CALLS) throw new PlanError(`More than ${MAX_CALLS} capability calls were planned`);
  const keys = new Set<string>();
  for (const call of calls) {
    if (!CALL_KEY_PATTERN.test(call.key)) throw new PlanError("A call key is malformed");
    if (keys.has(call.key)) throw new PlanError("Call keys must be unique");
    keys.add(call.key);
  }

  const envelope: Envelope = { results: {} };
  const executions: ExecutionRecord[] = [];
  for (const call of calls) {
    const outcome = await executeCapability(session, call.capabilityId, call.input);
    executions.push(outcome.record);
    if (outcome.result) envelope.results[call.key] = outcome.result.data;
  }

  return {
    envelope,
    executions,
    failed: executions.some((e) => e.status !== "ok"),
    narrowed: executions.some((e) => e.policyChecks.some((c) => c.status === "narrowed")),
  };
}

/** What the user sees when a required call was denied or failed. Contains no fabricated data. */
export function blockedComponents(): ExperienceComponent[] {
  return [
    { type: "Notice", id: "blocked", level: "warning", text: "This request could not be completed for the selected role." },
    {
      type: "EmptyState",
      id: "empty",
      title: "Nothing to show",
      text: "The policy layer or a service blocked a required call. See how PAA handled it in the inspector.",
    },
  ];
}

export function scopeNotice(): ExperienceComponent {
  return { type: "Notice", id: "scope", level: "info", text: "Results are limited to the data this role is permitted to see." };
}
