import PptxGenJS from "pptxgenjs";
import type { DocBlock, ResolvedDocument } from "./types";
import { buildSlides } from "./slides";

const FONT = "Calibri";
const INK = "111827";
const MUTED = "6B7280";
const SOFT = "F3F4F6";
const PALETTE = ["6366F1", "06B6D4", "F59E0B", "EC4899", "10B981", "8B5CF6", "F97316"];

const colour = (hexValue: string) => hexValue.replace("#", "").toUpperCase();

/** Builds a branded 16:9 deck with native, editable PowerPoint charts and tables. */
export async function buildPptx(doc: ResolvedDocument): Promise<Buffer> {
  const accent = colour(doc.brand.accent);
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pres.title = doc.title;
  pres.author = doc.brand.name;
  pres.company = doc.brand.name;

  pres.defineSlideMaster({
    title: "BRAND",
    background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 0, w: "100%", h: 0.12, fill: { color: accent } } },
      { text: { text: doc.brand.footer, options: { x: 0.6, y: 7.05, w: 9, h: 0.3, fontFace: FONT, fontSize: 9, color: MUTED } } },
    ],
    slideNumber: { x: 12.3, y: 7.05, fontFace: FONT, fontSize: 9, color: MUTED },
  });

  for (const slide of buildSlides(doc)) {
    if (slide.kind === "title") {
      const s = pres.addSlide();
      s.background = { color: accent };
      s.addText(doc.brand.name.toUpperCase(), { x: 0.8, y: 0.7, w: 11, h: 0.4, fontFace: FONT, fontSize: 14, bold: true, color: "FFFFFF", charSpacing: 3 });
      s.addText(slide.title, { x: 0.8, y: 2.4, w: 11.5, h: 1.8, fontFace: FONT, fontSize: 44, bold: true, color: "FFFFFF", valign: "top" });
      if (slide.subtitle) s.addText(slide.subtitle, { x: 0.8, y: 4.4, w: 11, h: 0.6, fontFace: FONT, fontSize: 20, color: "FFFFFF" });
      s.addText(doc.brand.footer, { x: 0.8, y: 6.8, w: 11, h: 0.4, fontFace: FONT, fontSize: 11, color: "FFFFFF" });
      continue;
    }

    const s = pres.addSlide({ masterName: "BRAND" });
    s.addText(slide.title, { x: 0.6, y: 0.4, w: 12.1, h: 0.8, fontFace: FONT, fontSize: 28, bold: true, color: INK });
    s.addShape(pres.ShapeType.rect, { x: 0.6, y: 1.2, w: 0.7, h: 0.06, fill: { color: accent }, line: { color: accent } });

    let y = 1.55;
    const kpis = slide.blocks.filter((b): b is Extract<DocBlock, { type: "kpi" }> => b.type === "kpi");
    for (const b of slide.blocks) {
      if (b.type === "kpi") continue;
      if (b.type === "paragraph") {
        const h = Math.max(0.6, Math.ceil(b.text.length / 95) * 0.34);
        s.addText(b.text, { x: 0.6, y, w: 12.1, h, fontFace: FONT, fontSize: 17, color: INK, valign: "top" });
        y += h + 0.2;
      } else if (b.type === "bullets") {
        s.addText(
          b.items.map((t) => ({ text: t, options: { bullet: { indent: 18 }, breakLine: true } })),
          { x: 0.6, y, w: 12.1, h: Math.max(0.6, b.items.length * 0.5), fontFace: FONT, fontSize: 17, color: INK, valign: "top", paraSpaceAfter: 6 },
        );
        y += Math.max(0.6, b.items.length * 0.5) + 0.2;
      } else if (b.type === "chart") {
        addChart(pres, s, b, accent, y);
      } else if (b.type === "table") {
        const widths = tableWidths(b);
        const header = b.columns.map((c) => ({
          text: c.label,
          options: { bold: true, color: MUTED, fill: { color: SOFT }, align: (c.numeric ? "right" : "left") as "right" | "left", fontFace: FONT, fontSize: 12 },
        }));
        const rows = b.rows.slice(0, 12).map((r) =>
          r.map((cell, k) => ({
            text: cell,
            options: { color: INK, bold: k === 0, align: (b.columns[k]?.numeric ? "right" : "left") as "right" | "left", fontFace: FONT, fontSize: 12 },
          })),
        );
        s.addTable([header, ...rows], { x: 0.6, y, w: 12.1, colW: widths, rowH: 0.36, border: { type: "solid", pt: 0.5, color: "E5E7EB" } });
      }
    }

    if (kpis.length > 0) {
      const n = Math.min(kpis.length, 3);
      const gap = 0.3;
      const w = (12.1 - gap * (n - 1)) / n;
      kpis.slice(0, 3).forEach((k, idx) => {
        const x = 0.6 + idx * (w + gap);
        s.addShape(pres.ShapeType.roundRect, { x, y: 5.0, w, h: 1.5, fill: { color: SOFT }, line: { color: "E5E7EB", width: 0.75 }, rectRadius: 0.1 });
        s.addShape(pres.ShapeType.rect, { x, y: 5.0, w, h: 0.07, fill: { color: accent }, line: { color: accent } });
        s.addText(k.title.toUpperCase(), { x: x + 0.2, y: 5.2, w: w - 0.4, h: 0.35, fontFace: FONT, fontSize: 11, bold: true, color: MUTED });
        s.addText(k.value, { x: x + 0.2, y: 5.6, w: w - 0.4, h: 0.7, fontFace: FONT, fontSize: 30, bold: true, color: accent, fit: "shrink" });
      });
    }
  }

  const out = await pres.write({ outputType: "nodebuffer" });
  return out as Buffer;
}

function tableWidths(b: Extract<DocBlock, { type: "table" }>): number[] {
  const weights = b.columns.map((c, k) => (k === 0 ? 1.7 : c.numeric ? 1 : 1.3));
  const total = weights.reduce((a, c) => a + c, 0);
  return weights.map((w) => (w / total) * 12.1);
}

function addChart(pres: PptxGenJS, s: PptxGenJS.Slide, b: Extract<DocBlock, { type: "chart" }>, accent: string, y: number) {
  const data = [{ name: b.title, labels: b.labels, values: b.values }];
  const common = { x: 0.6, y, w: 12.1, h: 5.2, catAxisLabelFontFace: FONT, catAxisLabelFontSize: 11, catAxisLabelColor: MUTED, valAxisLabelFontFace: FONT, valAxisLabelFontSize: 11, valAxisLabelColor: MUTED, valGridLine: { color: "E5E7EB", size: 0.5 }, catGridLine: { style: "none" as const } };
  if (b.chart === "donut") {
    s.addChart(pres.ChartType.doughnut, data, {
      x: 0.6,
      y,
      w: 12.1,
      h: 5.2,
      holeSize: 58,
      chartColors: b.values.map((_, i) => PALETTE[i % PALETTE.length]),
      showLegend: true,
      legendPos: "r",
      legendFontFace: FONT,
      legendFontSize: 13,
      showPercent: true,
      dataLabelColor: "FFFFFF",
      dataLabelFontSize: 12,
    });
  } else if (b.chart === "line") {
    s.addChart(pres.ChartType.line, data, { ...common, chartColors: [accent], lineSize: 3, lineDataSymbolSize: 8, showLegend: false });
  } else {
    s.addChart(pres.ChartType.bar, data, { ...common, barDir: "col", chartColors: [accent], showValue: b.values.length <= 10, dataLabelFontSize: 11, dataLabelColor: INK, showLegend: false });
  }
}
