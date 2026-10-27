import { dayOfWeek, eachDay } from "../dates";

/** All demo answers are computed relative to this date, so they are reproducible. */
export const REFERENCE_DATE = "2026-09-30";
export const DATA_START = "2026-04-01";
export const DATASET_VERSION = "northstar-seed-1";

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
  dailyUnits: number;
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

/** Intentional anomalies that make the suggested prompts interesting. */
const GDANSK_2_QUALITY_DRIFT_FROM = "2026-08-15";
const MONTERREY_CONVEYOR_ISSUE_FROM = "2026-09-01";

function pick<T>(items: readonly T[], weights: readonly number[], roll: number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += weights[i] / total;
    if (roll < acc) return items[i];
  }
  return items[items.length - 1];
}

function generate(): NorthstarDataset {
  const rng = mulberry32(20260930);
  const daily: DailyOutput[] = [];
  const downtime: DowntimeEvent[] = [];
  let eventSeq = 0;

  for (const date of eachDay(DATA_START, REFERENCE_DATE)) {
    const dow = dayOfWeek(date);
    if (dow === 0) continue;
    const dayFactor = dow === 6 ? 0.7 : 1;

    for (const line of LINE_SPECS) {
      const volumeNoise = 1 + (rng() - 0.5) * 0.12;
      const unitsProduced = Math.round(line.dailyUnits * dayFactor * volumeNoise);

      let rate = line.baseDefectRate * (1 + (rng() - 0.5) * 0.3);
      if (line.id === "gdansk-2" && date >= GDANSK_2_QUALITY_DRIFT_FROM) rate *= 2.8;
      daily.push({ date, lineId: line.id, unitsProduced, unitsDefective: Math.round(unitsProduced * rate) });

      const conveyorIssue = line.factoryId === "monterrey" && date >= MONTERREY_CONVEYOR_ISSUE_FROM;
      const eventCount = (rng() < (conveyorIssue ? 0.55 : 0.2) ? 1 : 0) + (conveyorIssue && rng() < 0.4 ? 1 : 0);
      for (let i = 0; i < eventCount; i++) {
        const weights = conveyorIssue ? [10, 8, 6, 6, 60, 10] : [28, 24, 16, 18, 4, 10];
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
