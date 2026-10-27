import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { runAction } from "@/lib/paa/actions/run";
import { brandFor } from "@/lib/paa/documents/brand";
import { chartSvg } from "@/lib/paa/documents/chart-svg";
import { buildPdf, winAnsi } from "@/lib/paa/documents/pdf";
import { buildPptx } from "@/lib/paa/documents/pptx";
import { documentFromExperience, resolveDeliverable } from "@/lib/paa/documents/resolve";
import { axisScale } from "@/lib/paa/documents/scale";
import { buildSlides } from "@/lib/paa/documents/slides";
import type { ResolvedDocument } from "@/lib/paa/documents/types";
import { formatValue } from "@/lib/paa/format";
import { runCurated } from "@/lib/paa/orchestration/curated";
import { resolveRef } from "@/lib/paa/schemas/bindings";

const director = { organizationId: "northstar", roleId: "operations_director" };
const supervisor = { organizationId: "northstar", roleId: "line_supervisor" };
const brand = brandFor("northstar");

async function realDocument(kind: "pdf" | "pptx" | "email", prompt = "downtime-comparison"): Promise<ResolvedDocument> {
  const run = await runCurated(director, prompt);
  return documentFromExperience(kind, run.experience, run.envelope, "northstar");
}

describe("axis scale", () => {
  it("includes zero, uses tidy steps and keeps ticks to six or fewer", () => {
    const a = axisScale([2624, 266, 92, -103, -106, -303]);
    expect(a.lo).toBeLessThanOrEqual(-303);
    expect(a.hi).toBeGreaterThanOrEqual(2624);
    expect(a.ticks.length).toBeLessThanOrEqual(6);
    expect(a.ticks).toContain(0);
    const step = a.ticks[1] - a.ticks[0];
    expect(a.ticks.every((t, i) => i === 0 || Math.abs(t - a.ticks[i - 1] - step) < 1e-9)).toBe(true);

    expect(axisScale([0.012, 0.015, 0.023]).hi).toBeGreaterThanOrEqual(0.023);
    expect(axisScale([0, 0])).toEqual({ lo: 0, hi: 1, ticks: [0, 1] });
  });
});

describe("document generators", () => {
  it("builds a branded PDF from real results", async () => {
    const bytes = await buildPdf(await realDocument("pdf"));
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getTitle()).toBe("Downtime: this month against last month");
    expect(pdf.getAuthor()).toBe("Northstar Manufacturing");
  });

  it("paginates long tables without losing rows", async () => {
    const doc: ResolvedDocument = {
      kind: "pdf",
      title: "Long table",
      brand,
      blocks: [{ type: "table", title: "Rows", columns: [{ label: "Name", numeric: false }, { label: "Value", numeric: true }], rows: Array.from({ length: 60 }, (_, i) => [`Row ${i}`, String(i)]) }],
    };
    const pdf = await PDFDocument.load(await buildPdf(doc));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it("survives characters the standard PDF fonts cannot encode", async () => {
    expect(winAnsi("−5% → ▲ ok “quoted” 日本")).toBe('-5% -> ^ ok “quoted” ??');
    const doc: ResolvedDocument = { kind: "pdf", title: "Unicode − test 日本", brand, blocks: [{ type: "paragraph", text: "Change −12% → recovery 日本語" }] };
    expect((await buildPdf(doc)).length).toBeGreaterThan(500);
  });

  it("builds a PPTX whose slides and native charts match the slide plan", async () => {
    const doc = await realDocument("pptx");
    const zip = await JSZip.loadAsync(await buildPptx(doc));
    const names = Object.keys(zip.files);
    const slides = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    const charts = names.filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
    expect(slides.length).toBe(buildSlides(doc).length);
    expect(charts.length).toBe(doc.blocks.filter((b) => b.type === "chart").length);
    const presentation = await zip.file("docProps/core.xml")?.async("string");
    expect(presentation).toContain("Downtime");
  });

  it("plans a title slide first, gives charts and tables their own slides, and caps the deck", () => {
    const blocks = Array.from({ length: 14 }, (_, i) => ({ type: "chart" as const, chart: "bar" as const, title: `C${i}`, labels: ["a"], values: [1], format: "number" as const }));
    const slides = buildSlides({ kind: "pptx", title: "Deck", brand, blocks });
    expect(slides[0].kind).toBe("title");
    expect(slides.length).toBe(12);
  });

  it("renders chart images as self-contained SVG and escapes labels", () => {
    const svg = chartSvg({ chart: "bar", labels: ["<script>", "B & C"], values: [3, 5], format: "integer", accent: "#2563eb" });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(chartSvg({ chart: "donut", labels: ["a", "b"], values: [1, 3], format: "number", accent: "#000" })).toContain("<path");
    expect(chartSvg({ chart: "line", labels: [], values: [], format: "number", accent: "#000" })).toContain("No data");
  });
});

describe("documents never disagree with the screen", () => {
  it("one-click documents carry exactly the values the view shows", async () => {
    const run = await runCurated(director, "downtime-comparison");
    const doc = documentFromExperience("pdf", run.experience, run.envelope, "northstar");
    const total = resolveRef(run.envelope, "results.downtime.summary.totalMinutes");
    const kpi = doc.blocks.find((b) => b.type === "kpi");
    expect(kpi).toMatchObject({ type: "kpi", value: formatValue(total, "minutes") });
    const table = doc.blocks.find((b) => b.type === "table");
    const rows = resolveRef(run.envelope, "results.downtime.rows") as { cause: string }[];
    expect(table && table.type === "table" ? table.rows.map((r) => r[0]) : []).toEqual(rows.map((r) => r.cause));
  });
});

describe("model-authored deliverables are validated like views", () => {
  const envelope = { results: { s: { summary: { total: 1234, rate: 0.0425 }, rows: [{ label: "A", value: 10 }, { label: "B", value: 20 }] } } };
  const opts = { brand, allowedNames: ["Gdansk Line 2"] };
  const spec = (blocks: unknown[], extra: object = {}) => ({ kind: "pptx", title: "Deck", blocks, ...extra });

  it("resolves bound data and slot text", () => {
    const r = resolveDeliverable(
      spec([
        { type: "heading", text: "Overview" },
        { type: "paragraph", template: "Total {{results.s.summary.total|integer}} at Gdansk Line 2." },
        { type: "kpi", title: "Rate", dataRef: "results.s.summary.rate", format: "percent" },
        { type: "chart", chart: "bar", title: "Bars", dataRef: "results.s.rows", xField: "label", yField: "value" },
        { type: "table", title: "T", dataRef: "results.s.rows", columns: [{ field: "label", label: "Label" }, { field: "value", label: "Value", format: "integer" }] },
      ]),
      envelope,
      opts,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.document.blocks[1]).toEqual({ type: "paragraph", text: "Total 1,234 at Gdansk Line 2." });
    expect(r.document.blocks[2]).toEqual({ type: "kpi", title: "Rate", value: "4.3%" });
  });

  it("rejects invented figures, bad references, unknown block types and oversize documents", () => {
    expect(resolveDeliverable(spec([{ type: "paragraph", template: "Sales rose 14% this year." }]), envelope, opts).ok).toBe(false);
    expect(resolveDeliverable(spec([{ type: "kpi", title: "x", dataRef: "results.s.summary.madeUp", format: "integer" }]), envelope, opts).ok).toBe(false);
    expect(resolveDeliverable(spec([{ type: "chart", chart: "bar", title: "x", dataRef: "results.s.rows", xField: "label", yField: "label" }]), envelope, opts).ok).toBe(false);
    expect(resolveDeliverable(spec([{ type: "script", code: "alert(1)" }]), envelope, opts).ok).toBe(false);
    expect(resolveDeliverable(spec(Array.from({ length: 15 }, () => ({ type: "heading", text: "h" }))), envelope, opts).ok).toBe(false);
    expect(resolveDeliverable({ kind: "docx", title: "x", blocks: [{ type: "heading", text: "h" }] }, envelope, opts).ok).toBe(false);
  });

  it("allows wording the visitor supplied, even with digits, but nothing else", () => {
    const request = "Make slides saying: Q3 target is 95% on-time delivery";
    const verbatim = resolveDeliverable(spec([{ type: "paragraph", template: "Q3 target is 95% on-time delivery" }]), envelope, { ...opts, verbatimSource: request });
    expect(verbatim.ok).toBe(true);
    const invented = resolveDeliverable(spec([{ type: "paragraph", template: "Q3 target is 99% on-time delivery" }]), envelope, { ...opts, verbatimSource: request });
    expect(invented.ok).toBe(false);
  });

  it("works with no data at all, for text-only documents", () => {
    const r = resolveDeliverable(spec([{ type: "heading", text: "Lorem ipsum" }, { type: "paragraph", template: "Dolor sit amet, consectetur adipiscing elit." }]), { results: {} }, opts);
    expect(r.ok).toBe(true);
  });

  it("builds an email with example-domain addresses", () => {
    const r = resolveDeliverable(
      { kind: "email", title: "Update", to: ["Leadership team", "Ops <ops@northstar.example>"], subject: "Weekly update", blocks: [{ type: "paragraph", template: "Hello." }] },
      { results: {} },
      opts,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.document.email?.to).toEqual(["Leadership team <leadership.team@northstar.example>", "Ops <ops@northstar.example>"]);
      expect(r.document.email?.from).toContain("@northstar.example");
    }
  });
});

describe("document actions are governed by role", () => {
  it("lets the director produce every kind", async () => {
    for (const kind of ["pdf", "pptx", "email"] as const) {
      const out = await runAction(director, await realDocument(kind));
      expect(out.record.status, `${kind}: ${out.record.error}`).toBe("ok");
      expect(out.deliverable?.kind).toBe(kind);
    }
  });

  it("produces files for PDF and PPTX, and only a draft for email", async () => {
    const pdf = await runAction(director, await realDocument("pdf"));
    expect(pdf.deliverable?.file?.filename).toMatch(/\.pdf$/);
    expect(Buffer.from(pdf.deliverable!.file!.base64, "base64").slice(0, 4).toString()).toBe("%PDF");
    const email = await runAction(director, await realDocument("email"));
    expect(email.deliverable?.file).toBeUndefined();
    expect(email.record.resultSummary).toContain("draft shown on screen");
  });

  it("lets a line supervisor export PDFs but blocks decks and email before generating anything", async () => {
    expect((await runAction(supervisor, await realDocument("pdf", "defect-trend"))).record.status).toBe("ok");
    for (const kind of ["pptx", "email"] as const) {
      const out = await runAction(supervisor, await realDocument(kind));
      expect(out.record.status).toBe("denied");
      expect(out.deliverable).toBeUndefined();
      expect(out.record.policyChecks.at(-1)?.status).toBe("denied");
    }
  });

  it("denies unknown roles and organizations", async () => {
    const doc = await realDocument("pdf");
    expect((await runAction({ organizationId: "northstar", roleId: "ghost" }, doc)).record.status).toBe("denied");
    expect((await runAction({ organizationId: "orbit", roleId: "finance" }, doc)).record.status).toBe("denied");
  });
});
