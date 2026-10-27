import { endOfMonth, parseDate, previousMonth, startOfMonth, type DateRange } from "../dates";

const pad = (n: number) => String(n).padStart(2, "0");

/** Most recent complete quarter as of the reference date (the quarter ending on it, if it is a quarter end). */
export function lastQuarter(reference: string): DateRange {
  const d = parseDate(reference);
  let year = d.getUTCFullYear();
  let quarter = Math.floor(d.getUTCMonth() / 3);
  if (reference < endOfMonth(`${year}-${pad(quarter * 3 + 3)}-01`)) {
    quarter -= 1;
    if (quarter < 0) {
      quarter = 3;
      year -= 1;
    }
  }
  return { from: `${year}-${pad(quarter * 3 + 1)}-01`, to: endOfMonth(`${year}-${pad(quarter * 3 + 3)}-01`) };
}

/** The reference month up to and including the reference date. */
export function thisMonth(reference: string): DateRange {
  return { from: startOfMonth(reference), to: reference };
}

export function lastMonth(reference: string): DateRange {
  return previousMonth(reference);
}
