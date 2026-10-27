const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

export function* eachDay(from: string, to: string): Generator<string> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

export function dayOfWeek(date: string): number {
  return parseDate(date).getUTCDay();
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: string): string {
  const d = parseDate(startOfMonth(date));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return formatDate(d);
}

export interface DateRange {
  from: string;
  to: string;
}

export function previousMonth(date: string): DateRange {
  const last = addDays(startOfMonth(date), -1);
  return { from: startOfMonth(last), to: last };
}

/** Monday of the week containing the date. */
export function weekStart(date: string): string {
  const dow = dayOfWeek(date);
  return addDays(date, -((dow + 6) % 7));
}

export function weekLabel(start: string): string {
  const d = parseDate(start);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
