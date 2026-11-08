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

describe("loading exported life data", () => {
  const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64");

  it("accepts a well-formed export", async () => {
    const { parseLifeData } = await import("@/lib/life/load");
    expect(parseLifeData(encode(lifeData))?.offers).toHaveLength(lifeData.offers.length);
  });

  it("returns nothing for missing, malformed or wrongly shaped input, so the page falls back", async () => {
    const { parseLifeData } = await import("@/lib/life/load");
    for (const bad of [undefined, "", "not base64 json", encode({}), encode({ ...lifeData, offers: "nope" })]) {
      expect(parseLifeData(bad), String(bad).slice(0, 20)).toBeUndefined();
    }
  });
});

describe("flags the source agents did not raise", () => {
  it("count as missing evidence instead of disappearing from the sum", () => {
    const data = { ...lifeData, flags: lifeData.flags.map((f) => (f.sourceId === "calendar" ? { ...f, raised: false } : f)) };
    const result = evaluate(data, all());
    const walk = result.withheld.find((w) => w.offer.id === "o-walk");
    expect(walk?.reason).toBe("evidence");
    expect(walk?.detail).toBe("Not enough supporting signals were raised.");
    expect(result.shown.find((s) => s.offer.id === "o-walk")).toBeUndefined();
  });
});
