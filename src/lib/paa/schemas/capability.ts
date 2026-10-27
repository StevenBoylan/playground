import type { z } from "zod";

export interface MetricDefinition {
  name: string;
  formula: string;
  unit: string;
}

export interface Provenance {
  service: string;
  params: Record<string, unknown>;
  datasetVersion: string;
  resultId: string;
}

/** What a capability's handler returns; the registry wraps it with provenance. */
export interface ServiceOutput<O> {
  data: O;
  metricDefinitions: MetricDefinition[];
  timeRange: { from: string; to: string };
  warnings?: string[];
  /** Fields or rows withheld because of the caller's role. Recorded as policy events and shown as a scope notice. */
  disclosures?: string[];
}

export interface ServiceResult<O> extends ServiceOutput<O> {
  warnings: string[];
  provenance: Provenance;
}

export interface Scope {
  /** Factories the caller may see, or "all". */
  factoryIds: string[] | "all";
}

export interface AuthorizedContext {
  organizationId: string;
  roleId: string;
  permissions: string[];
  scope: Scope;
}

export interface Session {
  organizationId: string;
  roleId: string;
}

export interface Capability<I, O> {
  id: string;
  organizationId: string;
  description: string;
  /** Human-readable explanation shown in the inspector. */
  explanation: string;
  requiredPermission: string;
  /** Input field that carries the scope restriction, narrowed by policy when the role is scoped. */
  scopeField?: "factoryId";
  datasetVersion: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  execute(input: I, context: AuthorizedContext): Promise<ServiceOutput<O>>;
}

export class ServiceInputError extends Error {}
