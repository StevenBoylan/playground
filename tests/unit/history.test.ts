import { describe, expect, it } from "vitest";
import { executeCapability } from "@/lib/paa/capabilities/registry";
import { DATA_START, DATA_YEARS, REFERENCE_DATE, getNorthstarDataset } from "@/lib/paa/data/seed";
import { dayOfWeek, quarterKey, quarterLabel, yearsBack } from "@/lib/paa/dates";
import { brandFor } from "@/lib/paa/documents/brand";
import { resolveDeliverable } from "@/lib/paa/documents/resolve";
import { lastYear, lastYears, yearToDate } from "@/lib/paa/orchestration/windows";
import { MAX_ROWS } from "@/lib/paa/schemas/experience";

const director = { organizationId: "northstar", roleId: "operations_director" };
const all = { dateFrom: DATA_START, dateTo: REFERENCE_DATE };

type Row = { key: string; label: string; unitsProduced: number; unitsDefective: number; defectRate: number };
async function production(input: Record<string, unknown>) {
  const out = await executeCapability(director, "northstar.production_summary", { ...all, ...input });
  expect(out.record.status, out.record.error).toBe("ok");
  return out.result?.data as { summary: { totalUnits: number }; rows: Row[] };
}

describe("four years of history", () => {
  it("spans exactly four years, with plants closed on Sundays and over Christmas", () => {
    const ds = getNorthstarDataset();
    expect(DATA_YEARS).toBe(4);
    expect(yearsBack(REFERENCE_DATE, DATA_YEARS)).toBe(DATA_START);
    expect(ds.daily[0].date).toBe(DATA_START);
    expect(ds.daily.at(-1)?.date).toBe(REFERENCE_DATE);
    const dates = new Set(ds.daily.map((d) => d.date));
    expect([...dates].some((d) => dayOfWeek(d) === 0)).toBe(false);
    for (const y of [2022, 2023, 2024, 2025]) {
      expect(dates.has(`${y}-12-25`)).toBe(false);
      expect(dates.has(`${y + 1}-01-01`)).toBe(false);
      expect(dates.has(`${y}-12-20`) || dates.has(`${y}-12-21`) || dates.has(`${y}-12-22`)).toBe(true);
    }
    expect(ds.daily.length).toBeGreaterThan(10_000);
  });

  it("offers weekly, monthly and quarterly views that all add up to the same total", async () => {
    const [quarterly, monthly, weekly] = await Promise.all([production({ groupBy: "quarter" }), production({ groupBy: "month" }), production({ groupBy: "week" })]);
    expect(quarterly.rows).toHaveLength(16);
    expect(quarterly.rows[0].label).toBe("Q4 2022");
    expect(quarterly.rows.at(-1)?.label).toBe("Q3 2026");
    expect(monthly.rows).toHaveLength(48);
    expect(weekly.rows.length).toBeGreaterThan(200);
    const sum = (r: Row[]) => r.reduce((a, x) => a + x.unitsProduced, 0);
    expect(sum(quarterly.rows)).toBe(quarterly.summary.totalUnits);
    expect(sum(monthly.rows)).toBe(quarterly.summary.totalUnits);
    expect(sum(weekly.rows)).toBe(quarterly.summary.totalUnits);
  });

  it("allows long weekly series through validation", () => {
    expect(MAX_ROWS).toBeGreaterThanOrEqual(260);
  });

  it("shows volume growth, quality improvement and a seasonal summer dip", async () => {
    const [y2023, y2025] = await Promise.all([
      production({ dateFrom: "2023-01-01", dateTo: "2023-12-31", groupBy: "factory" }),
      production({ dateFrom: "2025-01-01", dateTo: "2025-12-31", groupBy: "factory" }),
    ]);
    expect(y2025.summary.totalUnits).toBeGreaterThan(y2023.summary.totalUnits);
    const rate = (d: { rows: Row[] }) => d.rows.reduce((a, r) => a + r.unitsDefective, 0) / d.rows.reduce((a, r) => a + r.unitsProduced, 0);
    expect(rate(y2025)).toBeLessThan(rate(y2023));

    const months = await production({ dateFrom: "2025-01-01", dateTo: "2025-12-31", groupBy: "month" });
    const byMonth = new Map(months.rows.map((r) => [r.key, r.unitsProduced]));
    expect(byMonth.get("2025-08")!).toBeLessThan(byMonth.get("2025-10")! * 0.9);
    expect(byMonth.get("2025-12")!).toBeLessThan(byMonth.get("2025-11")! * 0.9);
  });

  it("contains the historical quality incidents", async () => {
    const line = async (dateFrom: string, dateTo: string) => {
      const out = await executeCapability(director, "northstar.defect_trend", { dateFrom, dateTo, granularity: "month", lineId: "monterrey-3" });
      return (out.result?.data as { summary: { overallDefectRate: number } }).summary.overallDefectRate;
    };
    // Monterrey Line 3 had a tooling problem from February to mid-May 2024, then recovered.
    expect(await line("2024-02-01", "2024-05-15")).toBeGreaterThan((await line("2024-06-01", "2024-09-30")) * 1.8);
  });

  it("contains the historical downtime incidents", async () => {
    const minutes = async (factoryId: string, cause: string, dateFrom: string, dateTo: string) => {
      const out = await executeCapability(director, "northstar.downtime_by_location", { dateFrom, dateTo, groupBy: "factory", cause, factoryId });
      return (out.result?.data as { summary: { totalMinutes: number } }).summary.totalMinutes;
    };
    expect(await minutes("gdansk", "Equipment failure", "2024-01-08", "2024-02-25")).toBeGreaterThan((await minutes("gdansk", "Equipment failure", "2025-01-08", "2025-02-25")) * 2);
    expect(await minutes("dublin", "Material shortage", "2025-03-03", "2025-04-18")).toBeGreaterThan((await minutes("dublin", "Material shortage", "2024-03-03", "2024-04-18")) * 2);
  });

  it("keeps the current stories intact", async () => {
    const defects = await executeCapability(director, "northstar.defect_rates", { dateFrom: "2026-07-01", dateTo: "2026-09-30" });
    expect((defects.result?.data as { summary: { worstLineLabel: string } }).summary.worstLineLabel).toBe("Gdansk Line 2");
    const downtime = await executeCapability(director, "northstar.downtime_breakdown", {
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      compareFrom: "2026-08-01",
      compareTo: "2026-08-31",
    });
    expect((downtime.result?.data as { summary: { topIncreaseCause: string } }).summary.topIncreaseCause).toBe("Conveyor failure");
  });
});

describe("quarter and year helpers", () => {
  it("labels quarters and resolves year windows from the reference date", () => {
    expect(quarterKey("2026-08-15")).toBe("2026-Q3");
    expect(quarterLabel("2026-Q3")).toBe("Q3 2026");
    expect(quarterKey("2023-01-01")).toBe("2023-Q1");
    expect(lastYear(REFERENCE_DATE)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(yearToDate(REFERENCE_DATE)).toEqual({ from: "2026-01-01", to: "2026-09-30" });
    expect(lastYears(REFERENCE_DATE, 2)).toEqual({ from: "2024-10-01", to: "2026-09-30" });
  });
});

describe("long series in documents", () => {
  it("states when a long time series was trimmed, and keeps the latest periods", async () => {
    const out = await executeCapability(director, "northstar.production_summary", { ...all, groupBy: "week" });
    const rows = (out.result?.data as { rows: Row[] }).rows;
    const r = resolveDeliverable(
      { kind: "pdf", title: "Weekly", blocks: [{ type: "chart", chart: "line", title: "Units by week", dataRef: "results.p.rows", xField: "label", yField: "unitsProduced" }] },
      { results: { p: { rows } } },
      { brand: brandFor("northstar") },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const chart = r.document.blocks[0];
    expect(chart.type === "chart" && chart.title).toContain(`(latest 40 of ${rows.length})`);
    expect(chart.type === "chart" && chart.labels.at(-1)).toBe(rows.at(-1)?.label);
    expect(chart.type === "chart" && chart.values).toHaveLength(40);
  });
});
