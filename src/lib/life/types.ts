export type Sensitivity = "low" | "medium" | "high";

export interface Source {
  id: string;
  name: string;
  /** One line on what this source contributes. */
  role: string;
  /** What the source agent is allowed to read. */
  sees: string;
  /** What it never reads, even though the service holds it. */
  neverSees: string;
}

/** A signal a source agent raises. Always a coarse statement, never a raw record. */
export interface Flag {
  id: string;
  sourceId: string;
  /** Short chip text, for the "Why me?" row. */
  short: string;
  /** The full statement the source agent produced. */
  label: string;
  sensitivity: Sensitivity;
  /** False when the source agent looked and did not raise this flag. Absent means raised. */
  raised?: boolean;
}

export interface Intent {
  id: string;
  label: string;
  summary: string;
}

export interface Category {
  id: string;
  label: string;
}

export interface Offer {
  id: string;
  categoryId: string;
  title: string;
  /** Fictional. */
  merchant: string;
  blurb: string;
  /** Whole pounds; 0 is free. */
  price: number;
  was?: number;
  ends: string;
  intentId: string;
  /** The evidence the commerce agent leaned on, and how much each piece counts. */
  flags: { flagId: string; weight: number }[];
  /** The commerce agent's reasoning, in its own words. */
  reasoning: string;
}

export interface LifeData {
  title: string;
  note: string;
  sources: Source[];
  flags: Flag[];
  intents: Intent[];
  categories: Category[];
  offers: Offer[];
  /** Offers costing more than this are held back while the low-cost preference is on. */
  budgetCap: number;
  /** The source whose flags express the low-cost preference. */
  budgetSourceId: string;
}
