export const FORMATS = ["integer", "number", "percent", "minutes", "text"] as const;
export type Format = (typeof FORMATS)[number];

const LOCALE = "en-GB";

export function formatValue(value: unknown, format: Format = "text"): string {
  if (format === "text") return value === null || value === undefined ? "" : String(value);
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "–";
  switch (format) {
    case "integer":
      return n.toLocaleString(LOCALE, { maximumFractionDigits: 0 });
    case "number":
      return n.toLocaleString(LOCALE, { maximumFractionDigits: 1 });
    case "percent":
      return `${(n * 100).toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    case "minutes":
      return `${n.toLocaleString(LOCALE, { maximumFractionDigits: 0 })} min`;
  }
}
