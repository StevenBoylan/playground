import { DATA_START, REFERENCE_DATE } from "./window";

export const ORBIT_DATASET_VERSION = "orbit-seed-1";

export interface Plan {
  id: string;
  name: string;
  /** Monthly list price in euros for a typical customer. */
  price: number;
}

export interface SegmentInfo {
  id: string;
  name: string;
}

export interface FeatureInfo {
  id: string;
  name: string;
  /** First month the feature existed. */
  launch: string;
}

export interface OrbitAccount {
  id: string;
  name: string;
  segment: string;
  /** Month the customer started. Customers that predate the data begin in an earlier month. */
  signupMonth: string;
}

/** One row per account per month in which it was a customer at any point. */
export interface AccountMonth {
  month: string;
  accountId: string;
  segment: string;
  planId: string;
  /** MRR at the start of the month (0 for a customer who joined during it). */
  mrrStart: number;
  /** MRR at the end of the month (0 for a customer who left during it). */
  mrrEnd: number;
  isNew: boolean;
  churned: boolean;
  /** How many of the product's features the account used this month. */
  featuresUsed: number;
}

export interface ChurnEvent {
  date: string;
  month: string;
  accountId: string;
  segment: string;
  planId: string;
  reason: string;
  mrrLost: number;
}

export type TicketCategory = "how-to" | "bug" | "billing" | "feature-request" | "outage";

export interface Ticket {
  id: string;
  date: string;
  month: string;
  accountId: string;
  segment: string;
  planId: string;
  category: TicketCategory;
  feature?: string;
  hoursToResolve: number;
}

/** Feature adoption, aggregated per month, segment and plan. */
export interface FeatureMonth {
  month: string;
  segment: string;
  planId: string;
  feature: string;
  adopters: number;
  /** Accounts that were customers at the end of the month in this segment and plan. */
  active: number;
}

export interface OrbitDataset {
  plans: Plan[];
  segments: SegmentInfo[];
  features: FeatureInfo[];
  accounts: OrbitAccount[];
  accountMonths: AccountMonth[];
  churn: ChurnEvent[];
  tickets: Ticket[];
  featureMonths: FeatureMonth[];
}

export const PLANS: Plan[] = [
  { id: "starter", name: "Starter", price: 49 },
  { id: "growth", name: "Growth", price: 199 },
  { id: "scale", name: "Scale", price: 799 },
  { id: "enterprise", name: "Enterprise", price: 3200 },
];

export const SEGMENTS: SegmentInfo[] = [
  { id: "smb", name: "SMB" },
  { id: "mid-market", name: "Mid-market" },
  { id: "enterprise", name: "Enterprise" },
];

export const FEATURES: FeatureInfo[] = [
  { id: "dashboards", name: "Dashboards", launch: "2022-10" },
  { id: "reports", name: "Reports", launch: "2022-10" },
  { id: "alerts", name: "Alerts", launch: "2022-10" },
  { id: "api", name: "API", launch: "2022-10" },
  { id: "integrations", name: "Integrations", launch: "2022-10" },
  { id: "sso", name: "SSO", launch: "2023-06" },
  { id: "mobile", name: "Mobile app", launch: "2023-09" },
];

/** Monthly chance an account that is not yet using a feature starts using it (before account and segment effects). */
const APPEAL: Record<string, number> = { dashboards: 0.2, reports: 0.12, alerts: 0.1, api: 0.08, integrations: 0.09, sso: 0.05, mobile: 0.12 };

/**
 * The story in the data. Underneath: steady customer growth, plan upgrades, and January churn. On top:
 * Enterprise launched in January 2023; a billing migration in March and April 2024 caused billing tickets and
 * some churn; and today, a July 2026 price rise on the Growth plan is driving churn while a release in
 * August 2026 has made the Integrations feature buggy.
 */
const ENTERPRISE_LAUNCH = "2023-01";
const BILLING_MIGRATION = { from: "2024-03", to: "2024-04" };
const GROWTH_PRICE_RISE_FROM = "2026-07";
const INTEGRATIONS_BUG_FROM = "2026-08";

const CHURN_BASE: Record<string, number> = { smb: 0.022, "mid-market": 0.011, enterprise: 0.004 };
const CHURN_PLAN: Record<string, number> = { starter: 1.3, growth: 1, scale: 0.8, enterprise: 0.6 };
const TICKET_BASE: Record<string, number> = { smb: 0.5, "mid-market": 0.6, enterprise: 0.9 };
const TICKET_PLAN: Record<string, number> = { starter: 1.1, growth: 1, scale: 0.9, enterprise: 0.8 };
const CATEGORIES: TicketCategory[] = ["how-to", "bug", "billing", "feature-request", "outage"];
const CATEGORY_WEIGHTS = [40, 25, 15, 12, 8];
const CHURN_REASONS = ["Price", "Missing features", "Switched to a competitor", "Business closed", "Low usage"];

const ADJECTIVES = ["Bright", "Nova", "Peak", "Lumen", "Atlas", "Cobalt", "Harbor", "Kestrel", "Maple", "Quartz", "Summit", "Tidal", "Vertex", "Willow", "Zephyr", "Ember"];
const NOUNS = ["wave", "works", "labs", "logic", "forge", "grid", "stack", "metrics", "flow", "point", "scape", "bridge"];
const TAILS = ["Systems", "Group", "Partners", "Digital"];

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

export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function nextPlan(planId: string): string | undefined {
  return planId === "starter" ? "growth" : planId === "growth" ? "scale" : undefined;
}

interface Live {
  account: OrbitAccount;
  planId: string;
  seatFactor: number;
  mrr: number;
  propensity: number;
  features: Set<string>;
}

function generate(): OrbitDataset {
  const rng = mulberry32(20260930 + 7);
  const months = monthRange(DATA_START, REFERENCE_DATE);

  // A shuffled, unique pool of company names.
  const pool: string[] = [];
  for (const a of ADJECTIVES) for (const n of NOUNS) for (const t of TAILS) pool.push(`${a}${n} ${t}`);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const accounts: OrbitAccount[] = [];
  const accountMonths: AccountMonth[] = [];
  const churn: ChurnEvent[] = [];
  const tickets: Ticket[] = [];
  const featureMonths: FeatureMonth[] = [];
  let live: Live[] = [];
  let ticketSeq = 0;

  const spawn = (month: string, signupMonth: string): Live => {
    const segRoll = rng();
    const segment = segRoll < 0.6 ? "smb" : segRoll < 0.9 ? "mid-market" : "enterprise";
    const planRoll = rng();
    const planId =
      segment === "smb"
        ? planRoll < 0.7
          ? "starter"
          : "growth"
        : segment === "mid-market"
          ? planRoll < 0.65
            ? "growth"
            : "scale"
          : month >= ENTERPRISE_LAUNCH
            ? "enterprise"
            : "scale";
    const baseP = segment === "smb" ? (planId === "starter" ? 0.35 : 0.5) : segment === "mid-market" ? (planId === "growth" ? 0.55 : 0.62) : 0.72;
    const account: OrbitAccount = { id: `acc-${String(accounts.length + 1).padStart(4, "0")}`, name: pool[accounts.length] ?? `Customer ${String.fromCharCode(65 + (accounts.length % 26))} Holdings`, segment, signupMonth };
    accounts.push(account);
    const seatFactor = 0.8 + rng() * 0.6;
    const price = PLANS.find((p) => p.id === planId)!.price;
    return {
      account,
      planId,
      seatFactor,
      mrr: Math.round(price * seatFactor),
      propensity: Math.min(0.97, Math.max(0.08, baseP + (rng() - 0.5) * 0.35)),
      features: new Set(),
    };
  };

  months.forEach((month, index) => {
    const calendarMonth = Number(month.slice(5, 7));
    const todo: { entry: Live; isNew: boolean }[] = [];

    if (index === 0) {
      // The book of customers that already existed when the data starts.
      for (let i = 0; i < 150; i++) {
        const entry = spawn(month, "2021-" + String(1 + Math.floor(rng() * 12)).padStart(2, "0"));
        for (const f of FEATURES) if (f.launch <= month && rng() < 0.5 * entry.propensity) entry.features.add(f.id);
        live.push(entry);
      }
      todo.push(...live.map((entry) => ({ entry, isNew: false })));
    } else {
      todo.push(...live.map((entry) => ({ entry, isNew: false })));
      const season = calendarMonth === 8 ? 0.8 : calendarMonth === 12 ? 0.7 : 1;
      const arrivals = Math.max(2, Math.round((4 + 0.16 * index) * season + (rng() - 0.5) * 4));
      for (let i = 0; i < arrivals; i++) {
        const entry = spawn(month, month);
        live.push(entry);
        todo.push({ entry, isNew: true });
      }
    }

    const adopters = new Map<string, number>();
    const actives = new Map<string, number>();
    const survivors: Live[] = [];

    for (const { entry, isNew } of todo) {
      const mrrStart = isNew ? 0 : entry.mrr;
      const { account } = entry;

      // Upgrades and growing seat counts.
      const upgrade = nextPlan(entry.planId);
      if (!isNew && upgrade && rng() < 0.01 * (0.5 + entry.propensity)) {
        entry.planId = upgrade;
        entry.seatFactor = 0.8 + rng() * 0.6;
      } else if (rng() < 0.3) entry.seatFactor *= 1.01;
      const price = PLANS.find((p) => p.id === entry.planId)!.price;
      entry.mrr = Math.round(price * entry.seatFactor);
      entry.propensity = Math.min(0.97, entry.propensity + 0.003);

      // Which features this account uses this month.
      for (const f of FEATURES) {
        if (f.launch > month) continue;
        const segmentFactor = f.id === "sso" ? (account.segment === "smb" ? 0.3 : 2) : 1;
        if (entry.features.has(f.id)) {
          if (rng() < 0.03 * (1 - entry.propensity)) entry.features.delete(f.id);
        } else if (rng() < APPEAL[f.id] * entry.propensity * segmentFactor) entry.features.add(f.id);
      }

      // Does the customer leave this month?
      let hazard = CHURN_BASE[account.segment] * (1.8 - 1.4 * entry.propensity) * CHURN_PLAN[entry.planId];
      if (calendarMonth === 1) hazard *= 1.5;
      if (entry.planId === "growth" && month >= GROWTH_PRICE_RISE_FROM) hazard *= 4.5;
      if (month >= BILLING_MIGRATION.from && month <= BILLING_MIGRATION.to && (entry.planId === "starter" || entry.planId === "growth")) hazard *= 1.5;
      const leaves = !isNew && rng() < hazard;

      if (leaves) {
        const price_rise = entry.planId === "growth" && month >= GROWTH_PRICE_RISE_FROM;
        const reason = pick(CHURN_REASONS, [price_rise ? 70 : 15, 20, 25, 15, 25], rng());
        const day = String(1 + Math.floor(rng() * 28)).padStart(2, "0");
        churn.push({ date: `${month}-${day}`, month, accountId: account.id, segment: account.segment, planId: entry.planId, reason, mrrLost: mrrStart });
      } else survivors.push(entry);

      accountMonths.push({
        month,
        accountId: account.id,
        segment: account.segment,
        planId: entry.planId,
        mrrStart,
        mrrEnd: leaves ? 0 : entry.mrr,
        isNew,
        churned: leaves,
        featuresUsed: entry.features.size,
      });

      // Support tickets raised this month.
      const lambda = TICKET_BASE[account.segment] * (2.2 - 2 * entry.propensity) * TICKET_PLAN[entry.planId];
      let count = Math.floor(lambda) + (rng() < lambda - Math.floor(lambda) ? 1 : 0);
      const adoptedList = [...entry.features];
      const raise = (category: TicketCategory, feature?: string) => {
        const hours = category === "bug" ? 20 + rng() * 52 : category === "how-to" ? 2 + rng() * 6 : category === "billing" ? 4 + rng() * 20 : category === "outage" ? 4 + rng() * 8 : 1 + rng() * 3;
        const day = String(1 + Math.floor(rng() * 28)).padStart(2, "0");
        tickets.push({ id: `tk-${++ticketSeq}`, date: `${month}-${day}`, month, accountId: account.id, segment: account.segment, planId: entry.planId, category, feature, hoursToResolve: Math.round(hours * 10) / 10 });
      };
      while (count-- > 0) {
        const billingBoost = month >= BILLING_MIGRATION.from && month <= BILLING_MIGRATION.to ? 4 : 1;
        const category = pick(CATEGORIES, CATEGORY_WEIGHTS.map((w, i) => (CATEGORIES[i] === "billing" ? w * billingBoost : w)), rng());
        const featureRelated = category === "bug" || category === "how-to" || category === "feature-request";
        raise(category, featureRelated && adoptedList.length > 0 ? adoptedList[Math.floor(rng() * adoptedList.length)] : undefined);
      }
      // The current story: since the August release, accounts using Integrations hit a bug.
      if (month >= INTEGRATIONS_BUG_FROM && entry.features.has("integrations") && rng() < 0.35) raise("bug", "integrations");

      if (!leaves) {
        const key = `${account.segment}|${entry.planId}`;
        actives.set(key, (actives.get(key) ?? 0) + 1);
        for (const f of entry.features) adopters.set(`${key}|${f}`, (adopters.get(`${key}|${f}`) ?? 0) + 1);
      }
    }

    for (const [key, active] of actives) {
      const [segment, planId] = key.split("|");
      for (const f of FEATURES) {
        if (f.launch > month) continue;
        featureMonths.push({ month, segment, planId, feature: f.id, adopters: adopters.get(`${key}|${f.id}`) ?? 0, active });
      }
    }
    live = survivors;
  });

  return { plans: PLANS, segments: SEGMENTS, features: FEATURES, accounts, accountMonths, churn, tickets, featureMonths };
}

let cached: OrbitDataset | undefined;

export function getOrbitDataset(): OrbitDataset {
  cached ??= generate();
  return cached;
}
