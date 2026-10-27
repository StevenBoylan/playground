import { describe, expect, it } from "vitest";
import { defectRate, relativeChange } from "@/lib/paa/data/metrics";
import { DATA_START, REFERENCE_DATE, getNorthstarDataset } from "@/lib/paa/data/seed";
import { lastMonth, lastQuarter, thisMonth } from "@/lib/paa/orchestration/windows";

describe("metric formulas", () => {
  it("computes defect rate as defective ÷ produced", () => {
    expect(defectRate(25, 1000)).toBeCloseTo(0.025);
    expect(defectRate(0, 0)).toBe(0);
  });

  it("computes relative change against a baseline", () => {
    expect(relativeChange(150, 100)).toBeCloseTo(0.5);
    expect(relativeChange(50, 0)).toBe(0);
  });
});

describe("synthetic dataset", () => {
  it("is deterministic and bounded by the documented dates", () => {
    const a = getNorthstarDataset();
    expect(a.daily.length).toBeGreaterThan(1000);
    expect(a.daily[0].date).toBe(DATA_START);
    expect(a.daily.at(-1)?.date).toBe(REFERENCE_DATE);
    // Same seed gives the same first record on every run.
    expect(a.daily[0]).toEqual({ date: DATA_START, lineId: "dublin-1", unitsProduced: a.daily[0].unitsProduced, unitsDefective: a.daily[0].unitsDefective });
    expect(getNorthstarDataset()).toBe(a);
  });

  it("never reports more defects than units", () => {
    for (const row of getNorthstarDataset().daily) expect(row.unitsDefective).toBeLessThanOrEqual(row.unitsProduced);
  });
});

describe("date windows", () => {
  it("resolves windows from the reference date", () => {
    expect(lastQuarter(REFERENCE_DATE)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(lastQuarter("2026-08-15")).toEqual({ from: "2026-04-01", to: "2026-06-30" });
    expect(thisMonth(REFERENCE_DATE)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(lastMonth(REFERENCE_DATE)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });
});
