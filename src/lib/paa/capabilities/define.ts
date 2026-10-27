import { z } from "zod";
import type { AuthorizedContext, Capability, ScopeField, ServiceOutput } from "../schemas/capability";

/** A capability with its generic types erased so a registry can hold many of them. */
export interface RegisteredCapability {
  id: string;
  organizationId: string;
  description: string;
  explanation: string;
  requiredPermission: string;
  scopeField?: ScopeField;
  datasetVersion: string;
  /** JSON Schema of the inputs and outputs, used to brief the model and kept in sync with validation. */
  inputJsonSchema: unknown;
  outputJsonSchema: unknown;
  /** Names of accepted input fields. */
  inputKeys: string[];
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
    inputJsonSchema: z.toJSONSchema(capability.inputSchema, { io: "input", unrepresentable: "any" }),
    outputJsonSchema: z.toJSONSchema(capability.outputSchema, { io: "output", unrepresentable: "any" }),
    inputKeys: inputKeysOf(capability.inputSchema),
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

function inputKeysOf(schema: z.ZodType): string[] {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as { properties?: Record<string, unknown> };
  return Object.keys(json.properties ?? {});
}
