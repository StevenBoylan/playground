import { z } from "zod";
import { FORMATS, formatValue, type Format } from "../format";
import { renderTemplate, resolveRef, isValidRefSyntax, type Envelope } from "../schemas/bindings";
import { checkFreeText, MAX_ROWS, type ExperienceSpec } from "../schemas/experience";
import { brandFor } from "./brand";
import { DOC_KINDS, type Brand, type DocBlock, type DocKind, type ResolvedDocument } from "./types";

export const MAX_BLOCKS = 14;
const MAX_CHART_POINTS = 40;
const MAX_TABLE_ROWS = 30;

const label = z.string().min(1).max(200);
const text = z.string().min(1).max(800);
const field = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/);
const format = z.enum(FORMATS);

/**
 * The model-authored description of a document. Like UI specs it is declarative and untrusted: data comes
 * from bound references, numbers in text only from slots, and nothing is generated until it validates.
 */
export const DeliverableSchema = z.strictObject({
  kind: z.enum(DOC_KINDS),
  title: label,
  subtitle: label.optional(),
  /** Email only: display names or addresses shown in the simulated window. Nothing is ever sent. */
  to: z.array(z.string().min(1).max(80)).max(5).optional(),
  subject: label.optional(),
  blocks: z
    .array(
      z.discriminatedUnion("type", [
        z.strictObject({ type: z.literal("heading"), text: label }),
        z.strictObject({ type: z.literal("paragraph"), template: text }),
        z.strictObject({ type: z.literal("bullets"), items: z.array(text).min(1).max(8) }),
        z.strictObject({ type: z.literal("kpi"), title: label, dataRef: z.string().max(200), format }),
        z.strictObject({
          type: z.literal("chart"),
          chart: z.enum(["bar", "line", "donut"]),
          title: label,
          dataRef: z.string().max(200),
          xField: field,
          yField: field,
          format: format.optional(),
        }),
        z.strictObject({
          type: z.literal("table"),
          title: label,
          dataRef: z.string().max(200),
          columns: z.array(z.strictObject({ field, label, format: format.optional() })).min(1).max(8),
        }),
      ]),
    )
    .min(1)
    .max(MAX_BLOCKS),
});

export type DeliverableSpec = z.infer<typeof DeliverableSchema>;

export interface ResolveOptions {
  brand: Brand;
  allowedNames?: string[];
  /** The visitor's own request text; passages copied verbatim from it may contain digits. */
  verbatimSource?: string;
}

export type ResolveResult = { ok: true; document: ResolvedDocument } | { ok: false; errors: string[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function rowsAt(envelope: Envelope, ref: string, id: string, errors: string[]): Record<string, unknown>[] | undefined {
  const value = isValidRefSyntax(ref) ? resolveRef(envelope, ref) : undefined;
  if (!Array.isArray(value) || !value.every(isRecord)) {
    errors.push(`${id}: dataRef "${ref}" does not resolve to a list of records`);
    return undefined;
  }
  if (value.length > MAX_ROWS) errors.push(`${id}: more than ${MAX_ROWS} rows`);
  return value;
}

function emailAddress(brand: Brand, to: string): string {
  return /<.+@.+>|@/.test(to) ? to : `${to} <${to.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "")}@${brand.emailDomain}>`;
}

/** Validates a deliverable spec against real results and resolves it into plain, formatted blocks. */
export function resolveDeliverable(raw: unknown, envelope: Envelope, options: ResolveOptions): ResolveResult {
  const parsed = DeliverableSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `deliverable.${i.path.join(".") || "(root)"}: ${i.message}`) };
  }
  const spec = parsed.data;
  const errors: string[] = [];
  const names = [...(options.allowedNames ?? [])].sort((a, b) => b.length - a.length);
  const blocks: DocBlock[] = [];

  spec.blocks.forEach((b, i) => {
    const id = `deliverable.blocks[${i}]`;
    switch (b.type) {
      case "heading":
        blocks.push({ type: "heading", text: b.text });
        break;
      case "paragraph":
        checkFreeText(id, b.template, envelope, errors, names, options.verbatimSource);
        blocks.push({ type: "paragraph", text: renderTemplate(b.template, envelope) });
        break;
      case "bullets":
        b.items.forEach((item) => checkFreeText(id, item, envelope, errors, names, options.verbatimSource));
        blocks.push({ type: "bullets", items: b.items.map((item) => renderTemplate(item, envelope)) });
        break;
      case "kpi": {
        const value = isValidRefSyntax(b.dataRef) ? resolveRef(envelope, b.dataRef) : undefined;
        if (value === undefined || isRecord(value) || Array.isArray(value)) {
          errors.push(`${id}: dataRef "${b.dataRef}" does not resolve to a value`);
        } else blocks.push({ type: "kpi", title: b.title, value: formatValue(value, b.format) });
        break;
      }
      case "chart": {
        const rows = rowsAt(envelope, b.dataRef, id, errors);
        if (!rows) break;
        const first = rows[0];
        if (first && (!Object.hasOwn(first, b.xField) || typeof first[b.yField] !== "number")) {
          errors.push(`${id}: fields "${b.xField}" / "${b.yField}" are not usable (y must be numeric)`);
          break;
        }
        const slice = rows.slice(0, MAX_CHART_POINTS);
        blocks.push({
          type: "chart",
          chart: b.chart,
          title: b.title,
          labels: slice.map((r) => String(r[b.xField])),
          values: slice.map((r) => Number(r[b.yField])),
          format: (b.format ?? "number") as Format,
        });
        break;
      }
      case "table": {
        const rows = rowsAt(envelope, b.dataRef, id, errors);
        if (!rows) break;
        const first = rows[0];
        const missing = first ? b.columns.filter((c) => !Object.hasOwn(first, c.field)) : [];
        if (missing.length > 0) {
          errors.push(`${id}: fields not found: ${missing.map((m) => m.field).join(", ")}`);
          break;
        }
        blocks.push({
          type: "table",
          title: b.title,
          columns: b.columns.map((c) => ({ label: c.label, numeric: c.format !== undefined && c.format !== "text" })),
          rows: rows.slice(0, MAX_TABLE_ROWS).map((r) => b.columns.map((c) => formatValue(r[c.field], c.format))),
        });
        break;
      }
    }
  });

  if (errors.length > 0) return { ok: false, errors };

  const { brand } = options;
  return {
    ok: true,
    document: {
      kind: spec.kind,
      title: spec.title,
      subtitle: spec.subtitle,
      brand,
      blocks,
      ...(spec.kind === "email"
        ? {
            email: {
              from: `${brand.shortName} Reporting <reports@${brand.emailDomain}>`,
              to: (spec.to?.length ? spec.to : ["Leadership team"]).map((t) => emailAddress(brand, t)),
              subject: spec.subject ?? spec.title,
            },
          }
        : {}),
    },
  };
}

/**
 * One-click path (no model): turns the view on screen into a document. Every value comes from the same
 * result envelope the view was rendered from, so the document can never disagree with the screen.
 */
export function documentFromExperience(
  kind: DocKind,
  experience: ExperienceSpec,
  envelope: Envelope,
  organizationId: string,
): ResolvedDocument {
  const brand = brandFor(organizationId);
  const blocks: DocBlock[] = [];
  let subtitle: string | undefined;

  const rowsOf = (ref: string): Record<string, unknown>[] => {
    const v = resolveRef(envelope, ref);
    return Array.isArray(v) ? (v as Record<string, unknown>[]).slice(0, MAX_CHART_POINTS) : [];
  };

  for (const c of experience.components) {
    switch (c.type) {
      case "PageHeading":
        subtitle = c.subtitle;
        break;
      case "Narrative":
        blocks.push({ type: "paragraph", text: renderTemplate(c.template, envelope) });
        break;
      case "KpiCard":
        blocks.push({ type: "kpi", title: c.title, value: formatValue(resolveRef(envelope, c.dataRef), c.format) });
        break;
      case "Comparison":
        blocks.push({
          type: "kpi",
          title: c.title,
          value: `${formatValue(resolveRef(envelope, c.currentRef), c.format)} (${c.previousLabel}: ${formatValue(resolveRef(envelope, c.previousRef), c.format)})`,
        });
        break;
      case "LineChart":
      case "BarChart": {
        const rows = rowsOf(c.dataRef);
        blocks.push({
          type: "chart",
          chart: c.type === "LineChart" ? "line" : "bar",
          title: c.title,
          labels: rows.map((r) => String(r[c.xField])),
          values: rows.map((r) => Number(r[c.yField])),
          format: c.format ?? "number",
        });
        break;
      }
      case "DonutChart": {
        const rows = rowsOf(c.dataRef);
        blocks.push({
          type: "chart",
          chart: "donut",
          title: c.title,
          labels: rows.map((r) => String(r[c.nameField])),
          values: rows.map((r) => Math.max(0, Number(r[c.valueField]))),
          format: c.format ?? "number",
        });
        break;
      }
      case "DataTable":
        blocks.push({
          type: "table",
          title: c.title,
          columns: c.columns.map((col) => ({ label: col.label, numeric: col.format !== undefined && col.format !== "text" })),
          rows: rowsOf(c.dataRef)
            .slice(0, MAX_TABLE_ROWS)
            .map((r) => c.columns.map((col) => formatValue(r[col.field], col.format))),
        });
        break;
      case "Notice":
        blocks.push({ type: "paragraph", text: `Note: ${c.text}` });
        break;
      case "FilterBar":
      case "EmptyState":
        break;
    }
  }

  const doc: ResolvedDocument = {
    kind,
    title: experience.title,
    subtitle,
    brand,
    blocks: blocks.slice(0, MAX_BLOCKS),
  };
  if (kind === "email") {
    doc.email = {
      from: `${brand.shortName} Reporting <reports@${brand.emailDomain}>`,
      to: [`Leadership team <leadership@${brand.emailDomain}>`],
      subject: experience.title,
    };
  }
  return doc;
}
