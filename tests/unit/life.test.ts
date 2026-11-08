import { describe, expect, it } from "vitest";
import { evaluate, MIN_STRENGTH } from "@/lib/life/engine";
import { lifeData } from "@/lib/life/data";

const all = () => new Set(lifeData.sources.map((s) => s.id));
const without = (...ids: string[]) => new Set([...all()].filter((id) => !ids.includes(id)));

describe("the life offers data", () => {
  it("only refers to flags, intents and categories that exist", () => {
    const flags = new Set(lifeData.flags.map((f) => f.id));
    const sources = new Set(lifeData.sources.map((s) => s.id));
    for (const f of lifeData.flags) expect(sources.has(f.sourceId), f.id).toBe(true);
    for (const o of lifeData.offers) {
      expect(lifeData.intents.some((i) => i.id === o.intentId), o.id).toBe(true);
      expect(lifeData.categories.some((c) => c.id === o.categoryId), o.id).toBe(true);
      for (const ref of o.flags) expect(flags.has(ref.flagId), `${o.id}:${ref.flagId}`).toBe(true);
      expect(o.flags.reduce((s, r) => s + r.weight, 0)).toBeCloseTo(1, 5);
    }
    expect(sources.has(lifeData.budgetSourceId)).toBe(true);
  });
});

describe("evaluating offers", () => {
  it("shows an offer only when enough of its evidence is switched on", () => {
    for (const s of evaluate(lifeData, all()).shown) expect(s.strength).toBeGreaterThanOrEqual(MIN_STRENGTH);
  });

  it("holds back offers over the low-cost limit while that preference is on, and shows them when it is off", () => {
    const on = evaluate(lifeData, all());
    expect(on.withheld.some((w) => w.reason === "budget")).toBe(true);
    expect(on.shown.every((s) => s.offer.price <= lifeData.budgetCap)).toBe(true);
    const off = evaluate(lifeData, without(lifeData.budgetSourceId));
    expect(off.shown.some((s) => s.offer.price > lifeData.budgetCap)).toBe(true);
  });

  it("removes offers that depended on a source when it is switched off", () => {
    const base = evaluate(lifeData, all()).shown.map((s) => s.offer.id);
    const noCalendar = evaluate(lifeData, without("calendar"));
    expect(noCalendar.shown.length).toBeLessThan(base.length);
    expect(noCalendar.withheld.some((w) => w.reason === "evidence" && w.detail.includes("Google Calendar"))).toBe(true);
  });

  it("shows nothing when every source is off", () => {
    const none = evaluate(lifeData, new Set());
    expect(none.shown).toHaveLength(0);
    expect(none.withheld).toHaveLength(lifeData.offers.length);
  });

  it("lists the strongest match first", () => {
    const strengths = evaluate(lifeData, all()).shown.map((s) => s.strength);
    expect([...strengths].sort((a, b) => b - a)).toEqual(strengths);
  });
});
