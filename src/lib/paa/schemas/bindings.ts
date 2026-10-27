import { FORMATS, formatValue, type Format } from "../format";

/** The server-approved result envelope that UI specs are bound against. */
export interface Envelope {
  results: Record<string, unknown>;
}

const REF_PATTERN = /^results(\.[A-Za-z0-9_]+)+$/;

/** Matches `{{results.some.path|format}}` slots in narrative text. */
export const SLOT_PATTERN = /\{\{\s*([A-Za-z0-9_.]+)\s*(?:\|\s*([a-z]+))?\s*\}\}/g;

export function isValidRefSyntax(ref: string): boolean {
  return REF_PATTERN.test(ref);
}

/**
 * Resolves a dotted reference against the envelope by walking own properties only.
 * References are never evaluated as code.
 */
export function resolveRef(envelope: Envelope, ref: string): unknown {
  if (!isValidRefSyntax(ref)) return undefined;
  let current: unknown = envelope;
  for (const part of ref.split(".")) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) return undefined;
    if (!Object.hasOwn(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function isFormat(value: string | undefined): value is Format {
  return value !== undefined && (FORMATS as readonly string[]).includes(value);
}

/** Replaces slots with values formatted from the envelope. Unresolved slots render as an en dash. */
export function renderTemplate(template: string, envelope: Envelope): string {
  return template.replace(SLOT_PATTERN, (_match, ref: string, format?: string) => {
    const value = resolveRef(envelope, ref);
    if (value === undefined) return "–";
    return formatValue(value, isFormat(format) ? format : "text");
  });
}
