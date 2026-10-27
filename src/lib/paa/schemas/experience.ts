import { z } from "zod";
import { FORMATS } from "../format";
import { SLOT_PATTERN, isFormat, isValidRefSyntax, resolveRef, type Envelope } from "./bindings";

export const MAX_COMPONENTS = 12;
export const MAX_ROWS = 200;

const id = z.string().regex(/^[a-z0-9-]{1,64}$/);
const ref = z.string().max(200);
const label = z.string().min(1).max(200);
const text = z.string().min(1).max(600);
const field = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/);
const format = z.enum(FORMATS);

/** Inputs a FilterBar may change when it re-runs a service. Everything else is fixed by the plan. */
export const FILTER_PARAMS = ["factoryId", "granularity"] as const;
export const CALL_KEY_PATTERN = /^[a-z][A-Za-z0-9]{0,31}$/;
const callKey = z.string().regex(CALL_KEY_PATTERN);

const column = z.strictObject({ field, label, format: format.optional() });

const component = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("PageHeading"), id, text: label, subtitle: label.optional() }),
  z.strictObject({ type: z.literal("Narrative"), id, template: text }),
  z.strictObject({ type: z.literal("KpiCard"), id, title: label, dataRef: ref, format }),
  z.strictObject({
    type: z.literal("LineChart"),
    id,
    title: label,
    dataRef: ref,
    xField: field,
    yField: field,
    format: format.optional(),
  }),
  z.strictObject({
    type: z.literal("BarChart"),
    id,
    title: label,
    dataRef: ref,
    xField: field,
    yField: field,
    format: format.optional(),
  }),
  z.strictObject({
    type: z.literal("DonutChart"),
    id,
    title: label,
    dataRef: ref,
    nameField: field,
    valueField: field,
    format: format.optional(),
  }),
  z.strictObject({
    type: z.literal("DataTable"),
    id,
    title: label,
    dataRef: ref,
    columns: z.array(column).min(1).max(12),
  }),
  z.strictObject({
    type: z.literal("Comparison"),
    id,
    title: label,
    currentLabel: label,
    previousLabel: label,
    currentRef: ref,
    previousRef: ref,
    format,
    /** Whether an increase is good, bad or neutral, which sets the colour of the change. */
    higherIs: z.enum(["good", "bad", "neutral"]),
  }),
  z.strictObject({
    type: z.literal("FilterBar"),
    id,
    filters: z
      .array(
        z.strictObject({
          param: z.enum(FILTER_PARAMS),
          label,
          /** Key of the planned service call this filter re-runs. */
          callKey: callKey,
          options: z.array(z.strictObject({ value: z.string().max(40), label })).min(2).max(8),
        }),
      )
      .min(1)
      .max(3),
  }),
  z.strictObject({ type: z.literal("Notice"), id, level: z.enum(["info", "warning"]), text }),
  z.strictObject({ type: z.literal("EmptyState"), id, title: label, text }),
]);

export const ExperienceSchema = z.strictObject({
  version: z.literal("1"),
  title: label,
  components: z.array(component).min(1).max(MAX_COMPONENTS),
});

export type ExperienceSpec = z.infer<typeof ExperienceSchema>;
export type ExperienceComponent = ExperienceSpec["components"][number];

export type ValidationResult = { ok: true; spec: ExperienceSpec } | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Free text must not carry figures; numbers may only arrive through bound slots. */
export function checkFreeText(
  componentId: string,
  value: string,
  envelope: Envelope,
  errors: string[],
  allowedNames: string[],
  verbatimSource?: string,
): void {
  // Entity names such as "Gdansk Line 2" are labels, not figures, so their digits are allowed.
  let text = value.replace(SLOT_PATTERN, "");
  for (const name of allowedNames) text = text.split(name).join("");
  // Text the visitor typed themselves (for example "make slides saying ...") is their own wording, not a system
  // claim, so it may be reproduced verbatim even when it contains digits.
  const isVisitorText = verbatimSource !== undefined && value.trim().length > 0 && verbatimSource.includes(value.trim());
  if (/\d/.test(text) && !isVisitorText) {
    errors.push(`${componentId}: free text contains a number outside a {{slot}}`);
  }
  for (const match of value.matchAll(SLOT_PATTERN)) {
    const [, slotRef, slotFormat] = match;
    if (slotFormat !== undefined && !isFormat(slotFormat)) {
      errors.push(`${componentId}: unknown slot format "${slotFormat}"`);
    }
    const resolved = resolveRef(envelope, slotRef);
    if (resolved === undefined || isRecord(resolved) || Array.isArray(resolved)) {
      errors.push(`${componentId}: slot "${slotRef}" does not resolve to a value`);
    }
  }
}

function checkRows(
  componentId: string,
  dataRef: string,
  fields: { name: string; numeric?: boolean }[],
  envelope: Envelope,
  errors: string[],
): void {
  if (!isValidRefSyntax(dataRef)) {
    errors.push(`${componentId}: malformed dataRef`);
    return;
  }
  const rows = resolveRef(envelope, dataRef);
  if (!Array.isArray(rows) || !rows.every(isRecord)) {
    errors.push(`${componentId}: dataRef "${dataRef}" does not resolve to a list of records`);
    return;
  }
  if (rows.length > MAX_ROWS) errors.push(`${componentId}: more than ${MAX_ROWS} rows`);
  const first = rows[0];
  if (first === undefined) return;
  for (const { name, numeric } of fields) {
    if (!Object.hasOwn(first, name)) errors.push(`${componentId}: field "${name}" not found in data`);
    else if (numeric && typeof first[name] !== "number") errors.push(`${componentId}: field "${name}" is not numeric`);
  }
}

/** Validates an untrusted UI specification against the result envelope it will be rendered from. */
export interface ValidationOptions {
  /** Names (factories, lines) that may appear in free text even though they contain digits. */
  allowedNames?: string[];
}

export function validateExperience(raw: unknown, envelope: Envelope, options: ValidationOptions = {}): ValidationResult {
  // Longest first, so "Gdansk Line 2" is removed before any shorter name could split it.
  const allowedNames = [...(options.allowedNames ?? [])].sort((a, b) => b.length - a.length);
  const parsed = ExperienceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  }
  const spec = parsed.data;
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const c of spec.components) {
    if (seen.has(c.id)) errors.push(`${c.id}: duplicate component id`);
    seen.add(c.id);

    switch (c.type) {
      case "Narrative":
        checkFreeText(c.id, c.template, envelope, errors, allowedNames);
        break;
      case "Notice":
      case "EmptyState":
        checkFreeText(c.id, c.text, envelope, errors, allowedNames);
        break;
      case "KpiCard": {
        const value = isValidRefSyntax(c.dataRef) ? resolveRef(envelope, c.dataRef) : undefined;
        if (value === undefined || isRecord(value) || Array.isArray(value)) {
          errors.push(`${c.id}: dataRef "${c.dataRef}" does not resolve to a value`);
        }
        break;
      }
      case "LineChart":
      case "BarChart":
        checkRows(c.id, c.dataRef, [{ name: c.xField }, { name: c.yField, numeric: true }], envelope, errors);
        break;
      case "Comparison":
        for (const r of [c.currentRef, c.previousRef]) {
          if (!isValidRefSyntax(r) || typeof resolveRef(envelope, r) !== "number") {
            errors.push(`${c.id}: "${r}" does not resolve to a number`);
          }
        }
        break;
      case "FilterBar":
        break;
      case "DonutChart":
        checkRows(c.id, c.dataRef, [{ name: c.nameField }, { name: c.valueField, numeric: true }], envelope, errors);
        break;
      case "DataTable":
        checkRows(c.id, c.dataRef, c.columns.map((col) => ({ name: col.field })), envelope, errors);
        break;
      case "PageHeading":
        break;
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, spec };
}
