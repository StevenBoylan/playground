import type { Format } from "../format";

export const DOC_KINDS = ["pdf", "pptx", "email"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export interface Brand {
  name: string;
  shortName: string;
  accent: string;
  footer: string;
  emailDomain: string;
}

/** A block whose data has already been resolved and formatted. Generators never see unresolved references. */
export type DocBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "kpi"; title: string; value: string }
  | { type: "chart"; chart: "bar" | "line" | "donut"; title: string; labels: string[]; values: number[]; format: Format }
  | { type: "table"; title: string; columns: { label: string; numeric: boolean }[]; rows: string[][] };

export interface ResolvedDocument {
  kind: DocKind;
  title: string;
  subtitle?: string;
  brand: Brand;
  blocks: DocBlock[];
  email?: { from: string; to: string[]; subject: string };
}

/** What a request for a deliverable produces: a file (pdf/pptx) or an on-screen simulated email. */
export interface Deliverable {
  kind: DocKind;
  document: ResolvedDocument;
  /** Present for files. The browser turns it into a download and, for PDF, an inline preview. */
  file?: { filename: string; mime: string; base64: string };
}

export const MIME: Record<"pdf" | "pptx", string> = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "document"
  );
}
