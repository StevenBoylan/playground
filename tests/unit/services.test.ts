import { describe, expect, it } from "vitest";
import { executeCapability } from "@/lib/paa/capabilities/registry";
import { createRateLimiter } from "@/lib/shared/rate-limit";

const director = { organizationId: "northstar", roleId: "operations_director" };
const q3 = { dateFrom: "2026-07-01", dateTo: "2026-09-30" };

type Rows<T> = { rows: T[]; summary: Record<string, number | string> };
const data = async <T>(id: string, input: Record<string, unknown>) => {
  const out = await executeCapability(director, id, input);
  expect(out.record.status, out.record.error).toBe("ok");
  return out.result?.data as Rows<T>;
};

describe("defect trend", () => {
  it("shows the Gdansk Line 2 drift week by week", async () => {
    const d = await data<{ defectRate: number; label: string }>("northstar.defect_trend", { ...q3, granularity: "week", lineId: "gdansk-2" });
    expect(d.rows.length).toBeGreaterThan(10);
    expect(Number(d.summary.lastPeriodRate)).toBeGreaterThan(Number(d.summary.firstPeriodRate) * 1.8);
    expect(d.rows[0].label).toMatch(/^Week of /);
  });

  it("rejects a line outside the requested factory or role", async () => {
    const out = await executeCapability(director, "northstar.defect_trend", { ...q3, granularity: "week", lineId: "atlantis-9" });
    expect(out.record.error).toBe("Unknown line");
    const supervisor = { organizationId: "northstar", roleId: "line_supervisor" };
    const hidden = await executeCapability(supervisor, "northstar.defect_trend", { ...q3, granularity: "week", lineId: "gdansk-2" });
    expect(hidden.record.status).toBe("error");
    expect(hidden.result).toBeUndefined();
  });
});

describe("downtime services", () => {
  it("finds Monterrey as the biggest downtime location in September", async () => {
    const d = await data<{ label: string; minutes: number; events: number }>("northstar.downtime_by_location", {
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      groupBy: "factory",
    });
    expect(d.summary.topLabel).toBe("Monterrey Plant");
    expect(d.rows.reduce((a, r) => a + r.minutes, 0)).toBe(d.summary.totalMinutes);
  });

  it("filters by cause and trends downtime over time", async () => {
    const conveyor = await data<{ minutes: number }>("northstar.downtime_by_location", { ...q3, groupBy: "line", cause: "Conveyor failure" });
    expect(conveyor.rows.length).toBeGreaterThan(0);
    const trend = await data<{ label: string; minutes: number }>("northstar.downtime_trend", { ...q3, granularity: "month", cause: "Conveyor failure" });
    expect(trend.rows.map((r) => r.label)).toEqual(["Jul 2026", "Aug 2026", "Sep 2026"]);
    const minutes = trend.rows.map((r) => r.minutes);
    expect(minutes[2]).toBeGreaterThan(minutes[0] * 3);
  });

  it("rejects unknown causes", async () => {
    const out = await executeCapability(director, "northstar.downtime_trend", { ...q3, granularity: "week", cause: "Gremlins" });
    expect(out.record.status).toBe("error");
  });
});

describe("production summary by week and line", () => {
  it("groups by week and filters to one line", async () => {
    const d = await data<{ unitsProduced: number }>("northstar.production_summary", { ...q3, groupBy: "week", lineId: "dublin-1" });
    expect(d.rows.length).toBeGreaterThan(10);
    const total = d.rows.reduce((a, r) => a + r.unitsProduced, 0);
    expect(total).toBe(d.summary.totalUnits);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window and recovers afterwards", () => {
    let now = 0;
    const limiter = createRateLimiter(2, 1000, () => now);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    const blocked = limiter.check("a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(limiter.check("b").allowed).toBe(true);
    now = 1001;
    expect(limiter.check("a").allowed).toBe(true);
  });
});
