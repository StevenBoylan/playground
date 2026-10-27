import type { Provenance } from "./capability";

export interface PolicyCheck {
  check: string;
  status: "allowed" | "denied" | "narrowed";
  detail: string;
}

/** A recorded service invocation. These are real events, not model-generated narrative. */
export interface ExecutionRecord {
  capabilityId: string;
  status: "ok" | "denied" | "error";
  params: Record<string, unknown>;
  policyChecks: PolicyCheck[];
  durationMs: number;
  provenance?: Provenance;
  warnings: string[];
  resultSummary?: string;
  error?: string;
}

export interface Decision {
  capabilityId: string;
  /** Why this capability was chosen. For curated prompts this is authored; later it is the model's stated rationale. */
  rationale: string;
  source: "curated" | "model_stated";
}

export interface Trace {
  organizationId: string;
  roleId: string;
  promptId: string;
  intent: { text: string; assumptions: string[] };
  decisions: Decision[];
  executions: ExecutionRecord[];
  experience: { componentCount: number; tree: { id: string; type: string; dataRef?: string }[] };
  /** Present when documents were requested: what was asked for, before each action's own policy check ran. */
  deliverables?: { kind: string; title: string; blockCount: number }[];
  /** Present for model-composed views: whether validation forced a repair round and what it objected to. */
  validation?: { repaired: boolean; firstErrors: string[] };
}
