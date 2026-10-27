import { quarterKey } from "../dates";
import { monthRange } from "./orbit-seed";
import { DATA_START, REFERENCE_DATE } from "./window";

export const GROVE_DATASET_VERSION = "grove-seed-1";

export interface Department {
  id: string;
  name: string;
}
export interface Named {
  id: string;
  name: string;
}

export const DEPARTMENTS: Department[] = [
  { id: "engineering", name: "Engineering" },
  { id: "product", name: "Product" },
  { id: "sales", name: "Sales" },
  { id: "customer-success", name: "Customer Success" },
  { id: "operations", name: "Operations" },
  { id: "finance", name: "Finance" },
  { id: "marketing", name: "Marketing" },
  { id: "people", name: "People" },
  // Deliberately tiny: too small to report on its own, so it shows the disclosure rules at work.
  { id: "legal", name: "Legal" },
];

export const LEVELS: Named[] = [
  { id: "ic", name: "Individual contributor" },
  { id: "senior", name: "Senior" },
  { id: "lead", name: "Lead" },
  { id: "director", name: "Director and above" },
];

export const LOCATIONS: Named[] = [
  { id: "lisbon", name: "Lisbon" },
  { id: "berlin", name: "Berlin" },
  { id: "remote", name: "Remote" },
];

export const STAGES: Named[] = [
  { id: "applied", name: "Applied" },
  { id: "screened", name: "Screened" },
  { id: "interviewed", name: "Interviewed" },
  { id: "offered", name: "Offered" },
  { id: "hired", name: "Hired" },
];

export const COURSES: Named[] = [
  { id: "security", name: "Security awareness" },
  { id: "privacy", name: "Data privacy" },
  { id: "conduct", name: "Code of conduct" },
  { id: "managers", name: "Manager essentials" },
];

export const LEAVE_TYPES: Named[] = [
  { id: "annual", name: "Annual leave" },
  { id: "sick", name: "Sick leave" },
  { id: "parental", name: "Parental leave" },
  { id: "other", name: "Other leave" },
];

export const THEMES: Named[] = [
  { id: "management", name: "Management" },
  { id: "growth", name: "Growth" },
  { id: "compensation", name: "Compensation" },
  { id: "workload", name: "Workload" },
  { id: "culture", name: "Culture" },
];

/** One row per department, level and location per month. These are the only people-level facts that exist, and they are counts. */
export interface HeadcountMonth {
  month: string;
  department: string;
  level: string;
  location: string;
  headcount: number;
  hires: number;
  leavers: number;
}

export interface FunnelMonth {
  month: string;
  department: string;
  applied: number;
  screened: number;
  interviewed: number;
  offered: number;
  hired: number;
  /** Sum of days from application to start across the hires, so averages can be combined correctly. */
  daysToHireTotal: number;
}

export interface TrainingQuarter {
  quarter: string;
  department: string;
  course: string;
  enrolled: number;
  completed: number;
}

export interface LeaveMonth {
  month: string;
  department: string;
  type: string;
  days: number;
  takers: number;
}

export interface EngagementQuarter {
  quarter: string;
  department: string;
  /** Headcount when the survey ran. */
  population: number;
  responses: number;
  /** 0 to 100. */
  score: number;
  themes: Record<string, number>;
}

/** Aggregates only. No individual employee record exists in this store. */
export interface GroveDataset {
  headcount: HeadcountMonth[];
  funnel: FunnelMonth[];
  training: TrainingQuarter[];
  leave: LeaveMonth[];
  engagement: EngagementQuarter[];
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], weights: readonly number[], roll: number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    acc += weights[i] / total;
    if (roll < acc) return items[i];
  }
  return items[items.length - 1];
}

/**
 * The shape of the history: a hiring burst before 2023, a freeze in spring 2023, steady growth, and a hiring surge in
 * 2025. On top sit stories: Engineering attrition rises and offers are turned down more from spring 2026; Sales falls
 * behind on security training; sick leave spikes in January 2025; Engineering workload and Sales pay score badly.
 */
const FINAL_SIZE: Record<string, number> = { engineering: 118, product: 34, sales: 78, "customer-success": 58, operations: 46, finance: 24, marketing: 30, people: 16, legal: 4 };
const INITIAL_SIZE: Record<string, number> = { engineering: 72, product: 22, sales: 52, "customer-success": 36, operations: 30, finance: 17, marketing: 19, people: 10, legal: 3 };
const ATTRITION: Record<string, number> = { engineering: 0.011, product: 0.01, sales: 0.018, "customer-success": 0.014, operations: 0.014, finance: 0.008, marketing: 0.012, people: 0.009, legal: 0 };

function hiringPhase(month: string): number {
  if (month < "2023-02") return 1.2;
  if (month < "2023-07") return 0.1; // hiring freeze
  if (month < "2025-01") return 0.85;
  if (month < "2026-01") return 1.6; // growth surge
  return 1.0;
}

interface Emp {
  department: string;
  level: string;
  location: string;
}

function generate(): GroveDataset {
  const rng = mulberry32(20260930 + 13);
  const months = monthRange(DATA_START, REFERENCE_DATE);
  const headcount: HeadcountMonth[] = [];
  const funnel: FunnelMonth[] = [];
  const training: TrainingQuarter[] = [];
  const leave: LeaveMonth[] = [];
  const engagement: EngagementQuarter[] = [];

  const newEmp = (department: string): Emp => ({
    department,
    level: pick(LEVELS.map((l) => l.id), [60, 27, 9, 4], rng()),
    location: pick(LOCATIONS.map((l) => l.id), [45, 35, 20], rng()),
  });

  let live: Emp[] = [];
  for (const [department, n] of Object.entries(INITIAL_SIZE)) for (let i = 0; i < n; i++) live.push(newEmp(department));

  const countBy = (people: Emp[], department: string) => people.filter((e) => e.department === department).length;

  months.forEach((month, index) => {
    const calendarMonth = Number(month.slice(5, 7));
    const hiresBy = new Map<string, number>();
    const leaversBy = new Map<string, number>();
    const key = (e: Emp) => `${e.department}|${e.level}|${e.location}`;
    const hireCells = new Map<string, number>();
    const leaveCells = new Map<string, number>();

    // Leavers.
    const stay: Emp[] = [];
    for (const e of live) {
      let hazard = ATTRITION[e.department] * (calendarMonth === 1 ? 1.3 : 1);
      if (e.department === "engineering" && month >= "2026-04") hazard *= 2.2;
      if (rng() < hazard) {
        leaversBy.set(e.department, (leaversBy.get(e.department) ?? 0) + 1);
        leaveCells.set(key(e), (leaveCells.get(key(e)) ?? 0) + 1);
      } else stay.push(e);
    }
    live = stay;

    // Hires.
    const hired: Emp[] = [];
    for (const d of DEPARTMENTS) {
      let hires: number;
      if (d.id === "legal") hires = month === "2024-05" ? 1 : 0;
      else {
        const lambda = FINAL_SIZE[d.id] * 0.013 * hiringPhase(month);
        hires = Math.floor(lambda) + (rng() < lambda - Math.floor(lambda) ? 1 : 0);
      }
      for (let i = 0; i < hires; i++) {
        const e = newEmp(d.id);
        hired.push(e);
        hireCells.set(key(e), (hireCells.get(key(e)) ?? 0) + 1);
      }
      hiresBy.set(d.id, hires);
    }
    live.push(...hired);

    // Headcount cells for the month.
    const endCells = new Map<string, number>();
    for (const e of live) endCells.set(key(e), (endCells.get(key(e)) ?? 0) + 1);
    const cells = new Set([...endCells.keys(), ...hireCells.keys(), ...leaveCells.keys()]);
    for (const c of cells) {
      const [department, level, location] = c.split("|");
      headcount.push({ month, department, level, location, headcount: endCells.get(c) ?? 0, hires: hireCells.get(c) ?? 0, leavers: leaveCells.get(c) ?? 0 });
    }

    // Hiring funnel, consistent with the actual hires.
    for (const d of DEPARTMENTS) {
      const hires = hiresBy.get(d.id) ?? 0;
      if (d.id === "legal" && hires === 0) continue;
      let acceptance = d.id === "sales" ? 0.8 : 0.85;
      if (d.id === "engineering" && month >= "2026-03") acceptance = 0.58;
      const noise = () => 0.9 + rng() * 0.2;
      const offered = hires === 0 ? Math.floor(rng() * 2) : Math.max(hires, Math.round((hires / acceptance) * noise()));
      const interviewed = Math.max(offered, Math.round(offered / 0.3 * noise()));
      const screened = Math.max(interviewed, Math.round(interviewed / 0.42 * noise()));
      const applied = Math.max(screened, Math.round(screened / 0.26 * noise()));
      const slow = d.id === "engineering" && month >= "2026-03" ? 12 : 0;
      funnel.push({ month, department: d.id, applied, screened, interviewed, offered, hired: hires, daysToHireTotal: Math.round(hires * (38 + slow + (rng() - 0.5) * 8)) });
    }

    // Leave, each month, by department and type.
    for (const d of DEPARTMENTS) {
      const size = countBy(live, d.id);
      if (size === 0) continue;
      const opsFactor = d.id === "operations" ? 1.2 : 1;
      const winter = calendarMonth === 11 || calendarMonth === 12 || calendarMonth === 1 || calendarMonth === 2 ? 1.8 : 1;
      const spike = month === "2025-01" ? 1.45 : 1;
      const annualTakers = Math.round(size * 0.34 * (0.9 + rng() * 0.2));
      const sickTakers = Math.round(size * 0.11 * winter * spike * (0.9 + rng() * 0.2));
      const parentalTakers = Math.floor(size * 0.006) + (rng() < size * 0.006 - Math.floor(size * 0.006) ? 1 : 0);
      const otherTakers = Math.round(size * 0.012 * (0.8 + rng() * 0.4));
      const rows: [string, number, number][] = [
        ["annual", annualTakers, 4.6],
        ["sick", sickTakers, 3.4],
        ["parental", parentalTakers, 19],
        ["other", otherTakers, 2.5],
      ];
      for (const [type, takers, perTaker] of rows) {
        if (takers === 0) continue;
        leave.push({ month, department: d.id, type, takers, days: Math.round(takers * perTaker * opsFactor * (0.9 + rng() * 0.2)) });
      }
    }

    // Quarterly: mandatory training and the engagement survey.
    if (calendarMonth % 3 === 0) {
      const quarter = quarterKey(`${month}-01`);
      const t = index / (months.length - 1);
      for (const d of DEPARTMENTS) {
        const people = live.filter((e) => e.department === d.id);
        const size = people.length;
        if (size === 0) continue;
        const managers = people.filter((e) => e.level === "lead" || e.level === "director").length;
        for (const c of COURSES) {
          const enrolled = c.id === "managers" ? managers : size;
          if (enrolled === 0) continue;
          let rate = c.id === "conduct" ? 0.97 : c.id === "managers" ? 0.85 : 0.94;
          if (d.id === "sales" && c.id === "security") rate = month >= "2026-06" ? 0.61 : month >= "2026-03" ? 0.78 : 0.93;
          if (d.id === "legal") rate = 1;
          rate = Math.min(1, Math.max(0, rate + (rng() - 0.5) * 0.04));
          training.push({ quarter, department: d.id, course: c.id, enrolled, completed: Math.min(enrolled, Math.round(enrolled * rate)) });
        }

        const deptOffset: Record<string, number> = { engineering: -1, product: 3, sales: -4, "customer-success": -2, operations: -3, finance: 4, marketing: 1, people: 5, legal: 2 };
        const trend = 1.5 * (t * 4) - (month >= "2026-04" ? 4 : 0);
        const base = 66 + (deptOffset[d.id] ?? 0) + trend + (d.id === "engineering" && month >= "2026-04" ? -6 : 0);
        const rate = 0.74 + (rng() - 0.5) * 0.2;
        const responses = d.id === "legal" ? Math.min(size, 3) : Math.max(1, Math.round(size * rate));
        const themeOffset: Record<string, number> = { management: 2, growth: -1, compensation: d.id === "sales" ? -10 : -3, workload: d.id === "engineering" && month >= "2026-04" ? -14 : -2, culture: 3 };
        const themes: Record<string, number> = {};
        for (const th of THEMES) themes[th.id] = Math.round(Math.min(98, Math.max(20, base + themeOffset[th.id] + (rng() - 0.5) * 3)) * 10) / 10;
        engagement.push({ quarter, department: d.id, population: size, responses, score: Math.round(Math.min(98, Math.max(20, base + (rng() - 0.5) * 2)) * 10) / 10, themes });
      }
    }
  });

  return { headcount, funnel, training, leave, engagement };
}

let cached: GroveDataset | undefined;

export function getGroveDataset(): GroveDataset {
  cached ??= generate();
  return cached;
}
