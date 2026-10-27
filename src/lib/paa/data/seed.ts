import { dayOfWeek, eachDay, parseDate } from "../dates";
import { DATA_START, DATA_YEARS, REFERENCE_DATE } from "./window";

export { DATA_START, DATA_YEARS, REFERENCE_DATE };

export const DATASET_VERSION = "northstar-seed-2";

export interface Factory {
  id: string;
  name: string;
  country: string;
}

export interface Product {
  id: string;
  name: string;
}

export interface ProductionLine {
  id: string;
  name: string;
  factoryId: string;
  productId: string;
}

export interface DailyOutput {
  date: string;
  lineId: string;
  unitsProduced: number;
  unitsDefective: number;
}

export interface DowntimeEvent {
  id: string;
  date: string;
  lineId: string;
  cause: string;
  minutes: number;
}

export interface NorthstarDataset {
  factories: Factory[];
  products: Product[];
  lines: ProductionLine[];
  daily: DailyOutput[];
  downtime: DowntimeEvent[];
}

export const DOWNTIME_CAUSES = [
  "Equipment failure",
  "Changeover",
  "Material shortage",
  "Planned maintenance",
  "Conveyor failure",
  "Quality hold",
] as const;

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FACTORIES: Factory[] = [
  { id: "dublin", name: "Dublin Plant", country: "Ireland" },
  { id: "gdansk", name: "Gdansk Plant", country: "Poland" },
  { id: "monterrey", name: "Monterrey Plant", country: "Mexico" },
];

const PRODUCTS: Product[] = [
  { id: "drive-unit", name: "Drive Unit" },
  { id: "control-board", name: "Control Board" },
  { id: "housing", name: "Housing Assembly" },
  { id: "sensor-pack", name: "Sensor Pack" },
];

interface LineSpec {
  id: string;
  name: string;
  factoryId: string;
  productId: string;
  /** Typical daily output today (the end of the data window). */
  dailyUnits: number;
  /** Typical defect rate today. */
  baseDefectRate: number;
}

const LINE_SPECS: LineSpec[] = [
  { id: "dublin-1", name: "Dublin Line 1", factoryId: "dublin", productId: "drive-unit", dailyUnits: 2600, baseDefectRate: 0.009 },
  { id: "dublin-2", name: "Dublin Line 2", factoryId: "dublin", productId: "control-board", dailyUnits: 2300, baseDefectRate: 0.011 },
  { id: "dublin-3", name: "Dublin Line 3", factoryId: "dublin", productId: "housing", dailyUnits: 2000, baseDefectRate: 0.013 },
  { id: "gdansk-1", name: "Gdansk Line 1", factoryId: "gdansk", productId: "drive-unit", dailyUnits: 2400, baseDefectRate: 0.01 },
  { id: "gdansk-2", name: "Gdansk Line 2", factoryId: "gdansk", productId: "sensor-pack", dailyUnits: 2200, baseDefectRate: 0.012 },
  { id: "gdansk-3", name: "Gdansk Line 3", factoryId: "gdansk", productId: "housing", dailyUnits: 1900, baseDefectRate: 0.014 },
  { id: "monterrey-1", name: "Monterrey Line 1", factoryId: "monterrey", productId: "control-board", dailyUnits: 2500, baseDefectRate: 0.012 },
  { id: "monterrey-2", name: "Monterrey Line 2", factoryId: "monterrey", productId: "sensor-pack", dailyUnits: 2100, baseDefectRate: 0.015 },
  { id: "monterrey-3", name: "Monterrey Line 3", factoryId: "monterrey", productId: "drive-unit", dailyUnits: 1800, baseDefectRate: 0.016 },
];

/**
 * The shape of the history. Underlying trends: volume grows about 4% a year, defect rates improve about 12%
 * of today's level per year (a quality programme), summer and December are quieter, and every plant shuts for
 * Christmas. On top of that sit incidents that give the suggested questions something to find.
 */
const VOLUME_GROWTH_PER_YEAR = 0.04;
const DEFECT_IMPROVEMENT_PER_YEAR = 0.12;
// January to December.
const SEASONAL_VOLUME = [0.97, 1.0, 1.02, 1.0, 1.02, 1.0, 0.95, 0.88, 1.03, 1.04, 1.03, 0.86];

interface Incident {
  lineId?: string;
  factoryId?: string;
  from: string;
  to: string;
}

/** Quality incidents: a multiplier on the defect rate while they last. */
const QUALITY_INCIDENTS: (Incident & { multiplier: number })[] = [
  // Supplier batch problem on one Dublin line.
  { lineId: "dublin-2", from: "2023-06-05", to: "2023-07-02", multiplier: 2.0 },
  // Tooling wear on Monterrey Line 3, fixed after a retool.
  { lineId: "monterrey-3", from: "2024-02-01", to: "2024-05-15", multiplier: 2.4 },
  // The current story: Gdansk Line 2 drifts out of tolerance and has not recovered.
  { lineId: "gdansk-2", from: "2026-08-15", to: "9999-12-31", multiplier: 2.8 },
];

/** Downtime incidents: a higher event rate and a dominant cause while they last. */
const DOWNTIME_INCIDENTS: (Incident & { rate: number; cause: (typeof DOWNTIME_CAUSES)[number]; secondEvent?: number })[] = [
  // An ageing press at Gdansk fails repeatedly over winter.
  { factoryId: "gdansk", from: "2024-01-08", to: "2024-02-25", rate: 0.45, cause: "Equipment failure" },
  // Supply-chain disruption hits Dublin.
  { factoryId: "dublin", from: "2025-03-03", to: "2025-04-18", rate: 0.4, cause: "Material shortage" },
  // The current story: Monterrey's conveyors start failing at the start of September 2026.
  { factoryId: "monterrey", from: "2026-09-01", to: "9999-12-31", rate: 0.55, cause: "Conveyor failure", secondEvent: 0.4 },
];

const BASE_DOWNTIME_RATE = 0.2;
const BASE_DOWNTIME_WEIGHTS = [28, 24, 16, 18, 4, 10];

function applies(incident: Incident, line: LineSpec, date: string): boolean {
  return (
    date >= incident.from &&
    date <= incident.to &&
    (incident.lineId === undefined || incident.lineId === line.id) &&
    (incident.factoryId === undefined || incident.factoryId === line.factoryId)
  );
}

/** Weights that make one cause dominate (about 60% of events) while keeping the others in proportion. */
function dominant(cause: (typeof DOWNTIME_CAUSES)[number]): number[] {
  const others = BASE_DOWNTIME_WEIGHTS.map((w, i) => (DOWNTIME_CAUSES[i] === cause ? 0 : w));
  const sum = others.reduce((a, b) => a + b, 0);
  return others.map((w, i) => (DOWNTIME_CAUSES[i] === cause ? 0.6 * (sum / 0.4) : w));
}

const DAY_MS = 24 * 60 * 60 * 1000;

function pick<T>(items: readonly T[], weights: readonly number[], roll: number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += weights[i] / total;
    if (roll < acc) return items[i];
  }
  return items[items.length - 1];
}

/** Plants are closed from Christmas Eve to New Year's Day, and on Sundays. */
function isShutdown(date: string): boolean {
  const month = date.slice(5, 7);
  const day = Number(date.slice(8, 10));
  return (month === "12" && day >= 24) || (month === "01" && day === 1) || dayOfWeek(date) === 0;
}

function generate(): NorthstarDataset {
  const rng = mulberry32(20260930);
  const daily: DailyOutput[] = [];
  const downtime: DowntimeEvent[] = [];
  let eventSeq = 0;
  const reference = parseDate(REFERENCE_DATE).getTime();

  for (const date of eachDay(DATA_START, REFERENCE_DATE)) {
    if (isShutdown(date)) continue;
    const dow = dayOfWeek(date);
    const dayFactor = dow === 6 ? 0.7 : 1;
    const yearsAgo = (reference - parseDate(date).getTime()) / (365.25 * DAY_MS);
    const volumeFactor = (1 - VOLUME_GROWTH_PER_YEAR * yearsAgo) * SEASONAL_VOLUME[Number(date.slice(5, 7)) - 1];
    const defectFactor = 1 + DEFECT_IMPROVEMENT_PER_YEAR * yearsAgo;

    for (const line of LINE_SPECS) {
      const volumeNoise = 1 + (rng() - 0.5) * 0.12;
      const unitsProduced = Math.round(line.dailyUnits * dayFactor * volumeFactor * volumeNoise);

      let rate = line.baseDefectRate * defectFactor * (1 + (rng() - 0.5) * 0.3);
      for (const incident of QUALITY_INCIDENTS) if (applies(incident, line, date)) rate *= incident.multiplier;
      daily.push({ date, lineId: line.id, unitsProduced, unitsDefective: Math.round(unitsProduced * rate) });

      const incident = DOWNTIME_INCIDENTS.find((i) => applies(i, line, date));
      const eventCount = (rng() < (incident?.rate ?? BASE_DOWNTIME_RATE) ? 1 : 0) + (incident?.secondEvent && rng() < incident.secondEvent ? 1 : 0);
      const weights = incident ? dominant(incident.cause) : BASE_DOWNTIME_WEIGHTS;
      for (let i = 0; i < eventCount; i++) {
        downtime.push({
          id: `dt-${++eventSeq}`,
          date,
          lineId: line.id,
          cause: pick(DOWNTIME_CAUSES, weights, rng()),
          minutes: 15 + Math.floor(rng() * 75),
        });
      }
    }
  }

  return {
    factories: FACTORIES,
    products: PRODUCTS,
    lines: LINE_SPECS.map(({ id, name, factoryId, productId }) => ({ id, name, factoryId, productId })),
    daily,
    downtime,
  };
}

let cached: NorthstarDataset | undefined;

export function getNorthstarDataset(): NorthstarDataset {
  cached ??= generate();
  return cached;
}
