import { formatValue, type Format } from "../format";
import { axisScale } from "./scale";

export interface ChartSvgInput {
  chart: "bar" | "line" | "donut";
  labels: string[];
  values: number[];
  format: Format;
  accent: string;
  width?: number;
  height?: number;
}

const PALETTE = ["#007f86", "#f59e0b", "#0891b2", "#ec4899", "#10b981", "#8b5cf6", "#f97316"];
const INK = "#1f2937";
const MUTED = "#6b7280";
const GRID = "#e5e7eb";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * A self-contained static chart. It is used where an interactive chart cannot go: inside the simulated
 * email and on slide previews, so those previews show real images of the real data.
 */
export function chartSvg({ chart, labels, values, format, accent, width = 560, height = 260 }: ChartSvgInput): string {
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="Helvetica, Arial, sans-serif">`;
  const bg = `<rect width="${width}" height="${height}" fill="#ffffff"/>`;
  if (values.length === 0) return `${head}${bg}<text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="${MUTED}" font-size="13">No data</text></svg>`;

  if (chart === "donut") return donut({ labels, values, format, width, height, head, bg });

  const left = 56;
  const right = 14;
  const top = 18;
  const bottom = 54;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const { lo, hi, ticks } = axisScale(values);
  const span = hi - lo || 1;
  const y = (v: number) => top + plotH - ((v - lo) / span) * plotH;
  const zeroY = y(0);

  const grid = ticks
    .map((v) => {
      return `<line x1="${left}" x2="${width - right}" y1="${y(v)}" y2="${y(v)}" stroke="${GRID}"/><text x="${left - 8}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="${MUTED}">${esc(formatValue(v, format))}</text>`;
    })
    .join("");

  const slot = plotW / values.length;
  const crowded = values.length > 7;
  const xLabels = labels
    .map((l, i) => {
      if (crowded && i % Math.ceil(values.length / 7) !== 0) return "";
      const cx = left + slot * i + slot / 2;
      return crowded
        ? `<text transform="translate(${cx},${height - bottom + 14}) rotate(-28)" text-anchor="end" font-size="10" fill="${MUTED}">${esc(trunc(l, 14))}</text>`
        : `<text x="${cx}" y="${height - bottom + 16}" text-anchor="middle" font-size="10" fill="${MUTED}">${esc(trunc(l, 14))}</text>`;
    })
    .join("");

  if (chart === "bar") {
    const max = Math.max(...values.map(Math.abs));
    const bw = Math.min(48, slot * 0.64);
    const bars = values
      .map((v, i) => {
        const cx = left + slot * i + slot / 2;
        const top0 = Math.min(y(v), zeroY);
        const h = Math.abs(y(v) - zeroY);
        const fill = v < 0 ? "#9ca3af" : Math.abs(v) === max ? accent : `${accent}88`;
        const value = values.length <= 10 ? `<text x="${cx}" y="${top0 - 5}" text-anchor="middle" font-size="9.5" font-weight="600" fill="${INK}">${esc(formatValue(v, format))}</text>` : "";
        return `<rect x="${cx - bw / 2}" y="${top0}" width="${bw}" height="${Math.max(h, 1)}" rx="4" fill="${fill}"/>${value}`;
      })
      .join("");
    return `${head}${bg}${grid}${bars}${xLabels}</svg>`;
  }

  // line
  const pts = values.map((v, i) => `${left + slot * i + slot / 2},${y(v)}`);
  const area = `${left + slot / 2},${zeroY} ${pts.join(" ")} ${left + slot * (values.length - 1) + slot / 2},${zeroY}`;
  const dots = values.map((v, i) => `<circle cx="${left + slot * i + slot / 2}" cy="${y(v)}" r="3.2" fill="#fff" stroke="${accent}" stroke-width="2"/>`).join("");
  return `${head}${bg}${grid}<polygon points="${area}" fill="${accent}" fill-opacity="0.12"/><polyline points="${pts.join(" ")}" fill="none" stroke="${accent}" stroke-width="2.6" stroke-linejoin="round"/>${dots}${xLabels}</svg>`;
}

function donut(o: { labels: string[]; values: number[]; format: Format; width: number; height: number; head: string; bg: string }): string {
  const { labels, values, format, width, height, head, bg } = o;
  const total = values.reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const cx = height / 2;
  const cy = height / 2;
  const r = height / 2 - 14;
  let angle = -Math.PI / 2;
  const slices = values
    .map((v, i) => {
      const frac = Math.max(0, v) / total;
      const a0 = angle;
      const a1 = angle + frac * Math.PI * 2;
      angle = a1;
      if (frac <= 0) return "";
      const large = frac > 0.5 ? 1 : 0;
      const p = (a: number) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
      const path = frac >= 0.9999 ? `M ${cx - r},${cy} a ${r},${r} 0 1,0 ${2 * r},0 a ${r},${r} 0 1,0 ${-2 * r},0` : `M ${cx},${cy} L ${p(a0)} A ${r},${r} 0 ${large} 1 ${p(a1)} Z`;
      return `<path d="${path}" fill="${PALETTE[i % PALETTE.length]}" stroke="#fff" stroke-width="2"/>`;
    })
    .join("");
  const hole = `<circle cx="${cx}" cy="${cy}" r="${r * 0.58}" fill="#fff"/>`;
  const legend = labels
    .slice(0, 10)
    .map((l, i) => {
      const ly = 26 + i * 22;
      return `<rect x="${height + 8}" y="${ly - 9}" width="10" height="10" rx="3" fill="${PALETTE[i % PALETTE.length]}"/><text x="${height + 26}" y="${ly}" font-size="11" fill="${INK}">${esc(trunc(l, 22))} <tspan fill="${MUTED}">${esc(formatValue(values[i], format))}</tspan></text>`;
    })
    .join("");
  return `${head}${bg}${slices}${hole}${legend}<!-- width ${width} --></svg>`;
}

/** An inline data URI, so the SVG can be used as an image source without any request. */
export function chartDataUri(input: ChartSvgInput): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(chartSvg(input))}`;
}
