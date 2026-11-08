import { z } from "zod";
import { lifeData } from "./data";
import type { LifeData } from "./types";

const Sensitivity = z.enum(["low", "medium", "high"]);

const Schema = z.object({
  title: z.string().max(80),
  note: z.string().max(400),
  budgetCap: z.number().nonnegative(),
  budgetSourceId: z.string(),
  categories: z.array(z.object({ id: z.string(), label: z.string() })).max(12),
  sources: z.array(z.object({ id: z.string(), name: z.string(), role: z.string(), sees: z.string(), neverSees: z.string(), status: z.enum(["connected", "stale", "missing"]).optional(), refreshed: z.string().max(40).optional() })).max(12),
  flags: z.array(z.object({ id: z.string(), sourceId: z.string(), short: z.string(), label: z.string(), sensitivity: Sensitivity, raised: z.boolean().optional() })).max(60),
  intents: z.array(z.object({ id: z.string(), label: z.string(), summary: z.string() })).max(12),
  offers: z
    .array(
      z.object({
        id: z.string(),
        categoryId: z.string(),
        title: z.string(),
        merchant: z.string(),
        blurb: z.string(),
        price: z.number().nonnegative(),
        was: z.number().nonnegative().optional(),
        ends: z.string(),
        intentId: z.string(),
        flags: z.array(z.object({ flagId: z.string(), weight: z.number().positive() })).min(1),
        reasoning: z.string(),
      }),
    )
    .max(60),
});

/**
 * Decodes the exported life data: base64-encoded JSON, as the workbench writes it. Returns undefined for anything
 * missing or malformed, so a bad export can never take the page down.
 */
export function parseLifeData(encoded: string | undefined): LifeData | undefined {
  if (!encoded) return undefined;
  try {
    const parsed = Schema.safeParse(JSON.parse(Buffer.from(encoded, "base64").toString("utf8")));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The real, exported data when LIFE_DATA is set (a private deployment setting, never committed), otherwise the
 * illustrative sample.
 */
export function loadLifeData(): LifeData {
  return parseLifeData(process.env.LIFE_DATA) ?? lifeData;
}
