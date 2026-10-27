import { endOfMonth, parseDate, previousMonth, startOfMonth, yearsBack, type DateRange } from "../dates";

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

/** The most recent full calendar year before the reference date's year. */
export function lastYear(reference: string): DateRange {
  const year = Number(reference.slice(0, 4)) - 1;
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function yearToDate(reference: string): DateRange {
  return { from: `${reference.slice(0, 4)}-01-01`, to: reference };
}

/** A window of whole years ending on the reference date. */
export function lastYears(reference: string, years: number): DateRange {
  return { from: yearsBack(reference, years), to: reference };
}

/** The last N calendar months, ending with the month of the reference date (so six months starts five months back). */
export function lastMonths(reference: string, months: number): DateRange {
  const d = parseDate(startOfMonth(reference));
  d.setUTCMonth(d.getUTCMonth() - (months - 1));
  return { from: d.toISOString().slice(0, 10), to: reference };
}
