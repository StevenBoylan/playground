import type { AuthorizedContext, Capability, ServiceOutput } from "../schemas/capability";

/** A capability with its generic types erased so a registry can hold many of them. */
export interface RegisteredCapability {
  id: string;
  organizationId: string;
  description: string;
  explanation: string;
  requiredPermission: string;
  scopeField?: "factoryId";
  datasetVersion: string;
  parseInput(raw: unknown): { ok: true; input: Record<string, unknown> } | { ok: false; error: string };
  run(input: Record<string, unknown>, context: AuthorizedContext): Promise<ServiceOutput<unknown>>;
}

export function defineCapability<I extends Record<string, unknown>, O>(
  capability: Capability<I, O>,
): RegisteredCapability {
  return {
    id: capability.id,
    organizationId: capability.organizationId,
    description: capability.description,
    explanation: capability.explanation,
    requiredPermission: capability.requiredPermission,
    scopeField: capability.scopeField,
    datasetVersion: capability.datasetVersion,
    parseInput(raw) {
      const parsed = capability.inputSchema.safeParse(raw);
      if (!parsed.success) {
        return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
      }
      return { ok: true, input: parsed.data };
    },
    async run(input, context) {
      const typed = capability.inputSchema.parse(input);
      const output = await capability.execute(typed, context);
      capability.outputSchema.parse(output.data);
      return output;
    },
  };
}
