import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatValue } from "../format";
import { axisScale } from "./scale";
import type { DocBlock, ResolvedDocument } from "./types";

const W = 595.28;
const H = 841.89;
const M = 48;
const CW = W - 2 * M;
const BOTTOM = 62;
const PALETTE = ["#007f86", "#f59e0b", "#0891b2", "#ec4899", "#10b981", "#8b5cf6", "#f97316"];

const INK = "#111827";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const SOFT = "#f3f4f6";

function hex(h: string) {
  const n = h.replace("#", "");
  return rgb(parseInt(n.slice(0, 2), 16) / 255, parseInt(n.slice(2, 4), 16) / 255, parseInt(n.slice(4, 6), 16) / 255);
}

/** Standard PDF fonts only cover WinAnsi, so common typographic characters are mapped and the rest dropped. */
export function winAnsi(s: string): string {
  const map: Record<string, string> = { "−": "-", "→": "->", "▲": "^", "▼": "v", "■": "-", "≥": ">=", "≤": "<=", "×": "x", " ": " " };
  const allowed = new Set([0x2022, 0x20ac, 0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2026]);
  return [...s]
    .map((ch) => {
      if (map[ch]) return map[ch];
      const code = ch.codePointAt(0) ?? 63;
      return code <= 255 || allowed.has(code) ? ch : "?";
    })
    .join("");
}

/** Builds a branded A4 PDF with vector charts and tables from a resolved document. */
export async function buildPdf(doc: ResolvedDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(winAnsi(doc.title));
  pdf.setAuthor(winAnsi(doc.brand.name));
  pdf.setCreator("Playground · Post-Application Architecture demo");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = hex(doc.brand.accent);

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const newPage = () => {
    page = pdf.addPage([W, H]);
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: accent });
    page.drawText(winAnsi(doc.brand.shortName), { x: M, y: H - 30, size: 9, font: bold, color: accent });
    y = H - 56;
  };
  const ensure = (needed: number) => {
    if (y - needed < BOTTOM) newPage();
  };
  const text = (s: string, x: number, yy: number, size: number, f: PDFFont, color = INK) =>
    page.drawText(winAnsi(s), { x, y: yy, size, font: f, color: hex(color) });

  const wrap = (s: string, f: PDFFont, size: number, maxW: number): string[] => {
    const out: string[] = [];
    for (const para of winAnsi(s).split("\n")) {
      let line = "";
      for (let word of para.split(/\s+/).filter(Boolean)) {
        while (f.widthOfTextAtSize(word, size) > maxW) {
          // Break a single over-long word rather than overflow the margin.
          let cut = word.length - 1;
          while (cut > 1 && f.widthOfTextAtSize(word.slice(0, cut), size) > maxW) cut--;
          if (line) out.push(line);
          out.push(word.slice(0, cut));
          line = "";
          word = word.slice(cut);
        }
        const test = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(test, size) <= maxW) line = test;
        else {
          if (line) out.push(line);
          line = word;
        }
      }
      out.push(line);
    }
    return out;
  };

  // --- Cover band ---------------------------------------------------------
  page.drawRectangle({ x: 0, y: H - 112, width: W, height: 112, color: accent });
  text(doc.brand.name.toUpperCase(), M, H - 38, 9, bold, "#ffffff");
  const titleLines = wrap(doc.title, bold, 22, CW);
  titleLines.slice(0, 2).forEach((l, i) => text(l, M, H - 66 - i * 26, 22, bold, "#ffffff"));
  if (doc.subtitle) text(doc.subtitle, M, H - 66 - Math.min(titleLines.length, 2) * 26 + 6, 10.5, font, "#ffffff");
  y = H - 112 - 28;

  // --- Blocks -------------------------------------------------------------
  const blocks = doc.blocks;
  for (let i = 0; i < blocks.length; i++) {
    const b: DocBlock = blocks[i];
    switch (b.type) {
      case "heading": {
        ensure(48);
        y -= 6;
        text(b.text, M, y, 14, bold);
        page.drawRectangle({ x: M, y: y - 8, width: 28, height: 2.5, color: accent });
        y -= 26;
        break;
      }
      case "paragraph": {
        const lines = wrap(b.text, font, 10.5, CW);
        for (const l of lines) {
          ensure(16);
          text(l, M, y, 10.5, font);
          y -= 15;
        }
        y -= 8;
        break;
      }
      case "bullets": {
        for (const item of b.items) {
          const lines = wrap(item, font, 10.5, CW - 16);
          ensure(16 * lines.length);
          page.drawCircle({ x: M + 4, y: y + 3.5, size: 2, color: accent });
          lines.forEach((l, k) => {
            text(l, M + 16, y - k * 15, 10.5, font);
          });
          y -= lines.length * 15 + 3;
        }
        y -= 6;
        break;
      }
      case "kpi": {
        const group: Extract<DocBlock, { type: "kpi" }>[] = [b];
        while (group.length < 3 && blocks[i + 1]?.type === "kpi") group.push(blocks[++i] as Extract<DocBlock, { type: "kpi" }>);
        ensure(70);
        const gap = 12;
        const bw = (CW - gap * (group.length - 1)) / group.length;
        group.forEach((k, idx) => {
          const x = M + idx * (bw + gap);
          page.drawRectangle({ x, y: y - 54, width: bw, height: 54, color: hex(SOFT), borderColor: hex(LINE), borderWidth: 0.8 });
          page.drawRectangle({ x, y: y - 3, width: bw, height: 3, color: accent });
          text(k.title.toUpperCase(), x + 10, y - 18, 7, bold, MUTED);
          const size = font.widthOfTextAtSize(winAnsi(k.value), 18) > bw - 20 ? 12 : 18;
          text(k.value, x + 10, y - 40, size, bold, doc.brand.accent);
        });
        y -= 54 + 18;
        break;
      }
      case "chart": {
        const chartH = 176;
        ensure(chartH + 40);
        text(b.title, M, y, 10.5, bold);
        y -= 14;
        drawChart(page, b, M, y, CW, chartH, font, bold, doc.brand.accent);
        y -= chartH + 22;
        break;
      }
      case "table": {
        const rowH = 19;
        ensure(rowH * 3 + 30);
        text(b.title, M, y, 10.5, bold);
        y -= 12;
        const n = b.columns.length;
        const weights = b.columns.map((c, k) => (k === 0 ? 1.7 : c.numeric ? 1 : 1.3));
        const total = weights.reduce((a, c) => a + c, 0);
        const widths = weights.map((w) => (w / total) * CW);
        const headerCells = b.columns.map((c) => c.label.toUpperCase());
        const drawRow = (cells: string[], header: boolean) => {
          if (y - rowH < BOTTOM) {
            newPage();
            // A table that runs onto a new page repeats its header so the columns stay readable.
            if (!header) drawRow(headerCells, true);
          }
          page.drawRectangle({ x: M, y: y - rowH, width: CW, height: rowH, color: header ? hex(SOFT) : undefined, borderColor: hex(LINE), borderWidth: header ? 0.8 : 0 });
          let x = M;
          cells.forEach((cell, k) => {
            const f = header || k === 0 ? bold : font;
            let t = winAnsi(cell);
            while (t.length > 1 && f.widthOfTextAtSize(t, 9) > widths[k] - 12) t = `${t.slice(0, -2)}…`;
            const tw = f.widthOfTextAtSize(winAnsi(t), 9);
            const tx = b.columns[k].numeric ? x + widths[k] - tw - 6 : x + 6;
            page.drawText(winAnsi(t), { x: tx, y: y - 13, size: 9, font: f, color: hex(header ? MUTED : INK) });
            x += widths[k];
          });
          if (!header) page.drawLine({ start: { x: M, y: y - rowH }, end: { x: M + CW, y: y - rowH }, thickness: 0.5, color: hex(LINE) });
          y -= rowH;
        };
        drawRow(headerCells, true);
        b.rows.forEach((r) => drawRow(r.slice(0, n), false));
        y -= 20;
        break;
      }
    }
  }

  // --- Footer on every page ----------------------------------------------
  const pages = pdf.getPages();
  pages.forEach((p, idx) => {
    p.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, thickness: 0.6, color: hex(LINE) });
    p.drawText(winAnsi(doc.brand.footer), { x: M, y: 26, size: 8, font, color: hex(MUTED) });
    const label = `Page ${idx + 1} of ${pages.length}`;
    p.drawText(label, { x: W - M - font.widthOfTextAtSize(label, 8), y: 26, size: 8, font, color: hex(MUTED) });
  });

  return pdf.save();
}

function drawChart(
  page: PDFPage,
  b: Extract<DocBlock, { type: "chart" }>,
  x: number,
  top: number,
  w: number,
  h: number,
  font: PDFFont,
  bold: PDFFont,
  accentHex: string,
) {
  const accent = hex(accentHex);
  const { values, labels, format } = b;
  if (values.length === 0) return;
  const label = (s: string, max: number) => winAnsi(s.length > max ? `${s.slice(0, max - 1)}…` : s);

  if (b.chart === "donut") {
    const r = h / 2 - 6;
    const total = values.reduce((a, v) => a + Math.max(0, v), 0) || 1;
    let angle = -Math.PI / 2;
    values.forEach((v, i) => {
      const frac = Math.max(0, v) / total;
      if (frac <= 0) return;
      const a0 = angle;
      const a1 = angle + frac * Math.PI * 2;
      angle = a1;
      const p = (a: number) => `${r + r * Math.cos(a)} ${r + r * Math.sin(a)}`;
      const path =
        frac >= 0.9999
          ? `M 0 ${r} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`
          : `M ${r} ${r} L ${p(a0)} A ${r} ${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${p(a1)} Z`;
      page.drawSvgPath(path, { x: x + 4, y: top - 4, color: hex(PALETTE[i % PALETTE.length]), borderColor: hex("#ffffff"), borderWidth: 1.5 });
    });
    page.drawCircle({ x: x + 4 + r, y: top - 4 - r, size: r * 0.58, color: hex("#ffffff") });
    labels.slice(0, 9).forEach((l, i) => {
      const ly = top - 18 - i * 17;
      page.drawRectangle({ x: x + r * 2 + 28, y: ly - 1, width: 8, height: 8, color: hex(PALETTE[i % PALETTE.length]) });
      page.drawText(`${label(l, 26)}  ${winAnsi(formatValue(values[i], format))}`, { x: x + r * 2 + 42, y: ly, size: 8.5, font, color: hex(INK) });
    });
    return;
  }

  const left = 52;
  const bottom = 30;
  const plotX = x + left;
  const plotW = w - left - 6;
  const plotTop = top - 10;
  const plotH = h - bottom - 10;
  const { lo, hi, ticks } = axisScale(values);
  const span = hi - lo || 1;
  const yAt = (v: number) => plotTop - plotH + ((v - lo) / span) * plotH;

  for (const v of ticks) {
    const yy = yAt(v);
    page.drawLine({ start: { x: plotX, y: yy }, end: { x: plotX + plotW, y: yy }, thickness: 0.5, color: hex(LINE) });
    const t = winAnsi(formatValue(v, format));
    page.drawText(t, { x: plotX - 6 - font.widthOfTextAtSize(t, 7.5), y: yy - 2.5, size: 7.5, font, color: hex(MUTED) });
  }

  const slot = plotW / values.length;
  const step = Math.ceil(values.length / 8);
  const zeroY = yAt(0);
  if (b.chart === "bar") {
    const maxAbs = Math.max(...values.map(Math.abs));
    const bw = Math.min(40, slot * 0.64);
    values.forEach((v, i) => {
      const cx = plotX + slot * i + slot / 2;
      const yy = yAt(v);
      const color = v < 0 ? hex("#9ca3af") : Math.abs(v) === maxAbs ? accent : hex(accentHex);
      page.drawRectangle({ x: cx - bw / 2, y: Math.min(yy, zeroY), width: bw, height: Math.max(Math.abs(yy - zeroY), 0.8), color, opacity: v >= 0 && Math.abs(v) !== maxAbs ? 0.5 : 1 });
      if (values.length <= 10) {
        const t = winAnsi(formatValue(v, format));
        page.drawText(t, { x: cx - font.widthOfTextAtSize(t, 7) / 2, y: Math.max(yy, zeroY) + 3, size: 7, font: bold, color: hex(INK) });
      }
      if (i % step === 0) {
        const t = label(labels[i] ?? "", Math.max(8, Math.floor(slot / 4.2)));
        page.drawText(t, { x: cx - font.widthOfTextAtSize(t, 7.5) / 2, y: top - h + 12, size: 7.5, font, color: hex(MUTED) });
      }
    });
    return;
  }

  // line
  const pts = values.map((v, i) => ({ x: plotX + slot * i + slot / 2, y: yAt(v) }));
  for (let i = 1; i < pts.length; i++) {
    page.drawLine({ start: pts[i - 1], end: pts[i], thickness: 2, color: accent });
  }
  pts.forEach((p, i) => {
    page.drawCircle({ x: p.x, y: p.y, size: 2.6, color: hex("#ffffff"), borderColor: accent, borderWidth: 1.6 });
    if (i % step === 0) {
      const t = label(labels[i] ?? "", 12);
      page.drawText(t, { x: p.x - font.widthOfTextAtSize(t, 7.5) / 2, y: top - h + 12, size: 7.5, font, color: hex(MUTED) });
    }
  });
}
