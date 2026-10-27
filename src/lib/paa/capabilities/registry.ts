import { createHash } from "node:crypto";
import { applyScope, authorizeAccess } from "../policies/authorize";
import { ServiceInputError, type ServiceResult, type Session } from "../schemas/capability";
import type { ExecutionRecord, PolicyCheck } from "../schemas/trace";
import type { RegisteredCapability } from "./define";
import {
  defectRates,
  defectTrend,
  downtimeBreakdown,
  downtimeByLocation,
  downtimeTrend,
  productionSummary,
} from "./northstar";

const SERVICE_TIMEOUT_MS = 5000;

const registry = new Map<string, RegisteredCapability>(
  [productionSummary, defectRates, defectTrend, downtimeBreakdown, downtimeByLocation, downtimeTrend].map((c) => [c.id, c]),
);

export function getCapability(id: string): RegisteredCapability | undefined {
  return registry.get(id);
}

export function listCapabilities(organizationId: string): RegisteredCapability[] {
  return [...registry.values()].filter((c) => c.organizationId === organizationId);
}

export interface ExecutionOutcome {
  record: ExecutionRecord;
  result?: ServiceResult<unknown>;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Service timed out")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function summarize(data: unknown): string {
  if (typeof data === "object" && data !== null && "rows" in data && Array.isArray(data.rows)) {
    return `${data.rows.length} rows`;
  }
  return "result returned";
}

/**
 * The only way to call a capability. Authorizes, validates input, applies data scope,
 * executes with a timeout, validates output, and records what actually happened.
 */
export async function executeCapability(
  session: Session,
  capabilityId: string,
  rawInput: unknown,
): Promise<ExecutionOutcome> {
  const started = performance.now();
  const capability = registry.get(capabilityId);
  let params: Record<string, unknown> = {};
  let checks: PolicyCheck[] = [];

  const finish = (partial: Pick<ExecutionRecord, "status"> & Partial<ExecutionRecord>): ExecutionRecord => ({
    capabilityId,
    params,
    policyChecks: checks,
    durationMs: Math.round(performance.now() - started),
    warnings: [],
    ...partial,
  });

  const access = authorizeAccess(session, capability);
  checks = access.checks;
  if (!access.allowed || !capability) {
    return { record: finish({ status: "denied", error: checks.at(-1)?.detail ?? "Denied" }) };
  }

  const parsed = capability.parseInput(rawInput);
  if (!parsed.ok) return { record: finish({ status: "error", error: `Invalid input: ${parsed.error}` }) };

  const scoped = applyScope(access.context, capability, parsed.input, checks);
  checks = scoped.checks;
  if (!scoped.allowed) {
    return { record: finish({ status: "denied", error: checks.at(-1)?.detail ?? "Denied" }) };
  }
  params = scoped.input;

  try {
    const output = await withTimeout(capability.run(scoped.input, access.context), SERVICE_TIMEOUT_MS);
    const resultId = createHash("sha256")
      .update(JSON.stringify({ id: capability.id, params, data: output.data }))
      .digest("hex")
      .slice(0, 12);
    const result: ServiceResult<unknown> = {
      ...output,
      warnings: output.warnings ?? [],
      provenance: { service: capability.id, params, datasetVersion: capability.datasetVersion, resultId },
    };
    return {
      result,
      record: finish({
        status: "ok",
        provenance: result.provenance,
        warnings: result.warnings,
        resultSummary: summarize(output.data),
      }),
    };
  } catch (error) {
    // Never leak stack traces or internals to the trace.
    const message = error instanceof ServiceInputError ? error.message : "The service could not complete the request";
    return { record: finish({ status: "error", error: message }) };
  }
}
