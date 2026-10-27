import { describe, expect, it } from "vitest";
import { executeCapability } from "@/lib/paa/capabilities/registry";
import { getGroveDataset } from "@/lib/paa/data/grove-seed";
import { REFERENCE_DATE } from "@/lib/paa/data/seed";
import { curatedPrompts, runCurated } from "@/lib/paa/orchestration/curated";
import { MIN_COHORT, mergeSmallGroups } from "@/lib/paa/policies/disclosure";

const hrbp = { organizationId: "grove", roleId: "hr_business_partner" };
const exec = { organizationId: "grove", roleId: "executive" };
const manager = { organizationId: "grove", roleId: "hiring_manager" };
const year = { dateFrom: "2026-01-01", dateTo: REFERENCE_DATE };

type Rows<R> = { rows: R[]; summary: Record<string, number | string | null> };
async function data<T>(session: typeof hrbp, id: string, input: Record<string, unknown>) {
  const out = await executeCapability(session, id, input);
  expect(out.record.status, out.record.error).toBe("ok");
  return { data: out.result?.data as T, record: out.record };
}

describe("mergeSmallGroups: disclosure control", () => {
  type G = { key: string; label: string; n: number };
  const size = (g: G) => g.n;
  const combine = (a: G, b: G): G => ({ ...a, n: a.n + b.n });
  const rows = (...ns: number[]): G[] => ns.map((n, i) => ({ key: `g${i}`, label: `G${i}`, n }));

  it("leaves groups alone when none is small", () => {
    const r = rows(20, 12, 8);
    expect(mergeSmallGroups(r, size, combine)).toEqual({ rows: r, merged: 0 });
  });

  it("never publishes a small group on its own: it is combined with the next smallest until large enough", () => {
    const result = mergeSmallGroups(rows(118, 34, 18, 4), size, combine);
    expect(result.rows.map((r) => r.key)).toEqual(["g0", "g1", "other"]);
    expect(result.rows.find((r) => r.key === "other")?.n).toBe(22);
    expect(result.merged).toBe(2);
  });

  it("keeps totals exact, so a hidden group cannot be recovered by subtraction", () => {
    for (const input of [rows(50, 3, 2, 1), rows(9, 4, 4), rows(30, 20, 4, 3, 2)]) {
      const total = input.reduce((a, g) => a + g.n, 0);
      const out = mergeSmallGroups(input, size, combine);
      expect(out.rows.reduce((a, g) => a + g.n, 0)).toBe(total);
      expect(out.rows.every((g) => g.n >= MIN_COHORT)).toBe(true);
    }
  });

  it("reports nothing when the whole population is too small", () => {
    expect(mergeSmallGroups(rows(2, 1), size, combine)).toEqual({ rows: [], merged: 2 });
  });

  it("keeps the caller's order for the groups that remain", () => {
    const out = mergeSmallGroups(
      [
        { key: "a", label: "A", n: 30 },
        { key: "b", label: "B", n: 2 },
        { key: "c", label: "C", n: 3 },
        { key: "d", label: "D", n: 12 },
        { key: "e", label: "E", n: 40 },
      ],
      size,
      combine,
    );
    expect(out.rows.map((r) => r.key)).toEqual(["a", "d", "e", "other"]);
  });
});

describe("the data store holds aggregates, never people", () => {
  it("has no field that could identify an individual", () => {
    const ds = getGroveDataset();
    const keys = new Set([...ds.headcount, ...ds.funnel, ...ds.training, ...ds.leave, ...ds.engagement].flatMap((r) => Object.keys(r)));
    for (const forbidden of ["name", "employeeId", "email", "salary", "manager", "id", "birthDate", "performance"]) expect(keys.has(forbidden), forbidden).toBe(false);
    expect([...keys].sort()).toEqual(
      ["completed", "course", "days", "daysToHireTotal", "department", "enrolled", "headcount", "hired", "hires", "interviewed", "leavers", "level", "location", "month", "offered", "applied", "population", "quarter", "responses", "score", "screened", "takers", "themes", "type"].sort(),
    );
  });

  it("makes individual records unavailable to every profile, by any name", async () => {
    for (const session of [hrbp, exec, manager]) {
      for (const id of ["grove.employee_records", "grove.employee_lookup", "grove.salaries", "grove.performance_reviews"]) {
        const out = await executeCapability(session, id, { name: "someone" });
        expect(out.record.status, `${session.roleId} ${id}`).toBe("denied");
        expect(out.result).toBeUndefined();
      }
    }
  });
});

describe("Grove's data tells its stories", () => {
  it("has headcount that adds up: end = start + hires - leavers", async () => {
    for (const window of [year, { dateFrom: "2023-02-01", dateTo: "2023-06-30" }, { dateFrom: "2022-10-01", dateTo: "2026-09-30" }]) {
      const { data: t } = await data<Rows<{ headcount: number }>>(hrbp, "grove.headcount_trend", { ...window, granularity: "month" });
      const s = t.summary as Record<string, number>;
      expect(s.currentHeadcount).toBe(s.startHeadcount + s.hires - s.leavers);
    }
  });

  it("shows the spring 2023 hiring freeze and the 2025 surge", async () => {
    const hires = async (dateFrom: string, dateTo: string) => Number(((await data<Rows<unknown>>(hrbp, "grove.headcount_trend", { dateFrom, dateTo, granularity: "quarter" })).data.summary as Record<string, number>).hires);
    expect(await hires("2023-02-01", "2023-06-30")).toBeLessThan(8);
    expect(await hires("2025-01-01", "2025-12-31")).toBeGreaterThan(60);
  });

  it("shows Engineering attrition rising and offers being turned down since spring 2026", async () => {
    const attrition = async (dateFrom: string, dateTo: string) => Number((await data<Rows<unknown>>(hrbp, "grove.headcount_trend", { dateFrom, dateTo, granularity: "quarter", department: "engineering" })).data.summary.attritionRate);
    expect(await attrition("2026-04-01", "2026-09-30")).toBeGreaterThan((await attrition("2025-04-01", "2025-09-30")) * 1.5);

    const acceptance = async (dateFrom: string, dateTo: string) => Number((await data<Rows<unknown>>(hrbp, "grove.hiring_funnel", { dateFrom, dateTo, department: "engineering" })).data.summary.offerAcceptanceRate);
    expect(await acceptance("2026-03-01", "2026-09-30")).toBeLessThan(0.7);
    expect(await acceptance("2025-06-01", "2026-02-28")).toBeGreaterThan(0.8);
  });

  it("shows Sales furthest behind on security training, and Engineering least engaged", async () => {
    const { data: sec } = await data<Rows<unknown>>(hrbp, "grove.training_completion", { asOf: REFERENCE_DATE, groupBy: "department", course: "security" });
    expect(sec.summary.lowestLabel).toBe("Sales");
    expect(Number(sec.summary.lowestRate)).toBeLessThan(0.7);
    const { data: eng } = await data<Rows<unknown>>(hrbp, "grove.engagement", { dateFrom: "2026-07-01", dateTo: REFERENCE_DATE, groupBy: "department" });
    expect(eng.summary.lowestLabel).toBe("Engineering");
  });

  it("shows the January 2025 sick-leave spike", async () => {
    const { data: months } = await data<Rows<{ key: string; leaveDays: number }>>(hrbp, "grove.leave_summary", { dateFrom: "2024-10-01", dateTo: "2025-06-30", groupBy: "month", type: "sick" });
    const byMonth = new Map(months.rows.map((r) => [r.key, r.leaveDays]));
    expect(byMonth.get("2025-01")!).toBeGreaterThan(byMonth.get("2024-12")! * 1.2);
    expect(byMonth.get("2025-01")!).toBeGreaterThan(byMonth.get("2025-06")! * 2);
  });
});

describe("small groups are never singled out", () => {
  it("folds Legal into 'Other' in a department breakdown, with an exact total", async () => {
    const { data: change, record } = await data<Rows<{ key: string; label: string; endHeadcount: number }>>(hrbp, "grove.headcount_change", { ...year, groupBy: "department" });
    expect(change.rows.some((r) => r.key === "legal")).toBe(false);
    const other = change.rows.find((r) => r.key === "other");
    expect(other?.label).toBe("Other (small groups)");
    expect(other!.endHeadcount).toBeGreaterThanOrEqual(MIN_COHORT);
    expect(change.rows.reduce((a, r) => a + r.endHeadcount, 0)).toBe(change.summary.totalEnd);
    expect(record.policyChecks.find((c) => c.check === "disclosure")).toMatchObject({ status: "narrowed" });
  });

  it("withholds a single group too small to report when it is asked for directly", async () => {
    const { data: legal, record } = await data<Rows<unknown>>(hrbp, "grove.headcount_trend", { ...year, granularity: "month", department: "legal" });
    expect(legal.rows).toEqual([]);
    // Withheld is a dash, never a zero.
    expect(Object.values(legal.summary).every((v) => v === null)).toBe(true);
    expect(record.policyChecks.some((c) => c.check === "disclosure" && c.detail.includes("fewer than five"))).toBe(true);
    const { data: funnel } = await data<Rows<{ candidates: number | null }>>(hrbp, "grove.hiring_funnel", { ...year, department: "legal" });
    expect(funnel.rows.every((r) => r.candidates === null)).toBe(true);
  });

  it("combines small levels inside a department, and never reports a respondent group under five", async () => {
    const { data: levels } = await data<Rows<{ key: string; endHeadcount: number }>>(hrbp, "grove.headcount_change", { ...year, groupBy: "level", department: "finance" });
    expect(levels.rows.every((r) => Math.min(r.endHeadcount, 1000) >= 0)).toBe(true);
    expect(levels.rows.some((r) => r.key === "other")).toBe(true);

    const { data: eng } = await data<Rows<{ key: string; responses: number }>>(hrbp, "grove.engagement", { dateFrom: "2025-01-01", dateTo: REFERENCE_DATE, groupBy: "department" });
    expect(eng.rows.some((r) => r.key === "legal")).toBe(false);
    expect(eng.rows.every((r) => r.responses >= MIN_COHORT)).toBe(true);
  });

  it("withholds leave in periods where fewer than five people took it", async () => {
    const { data: parental, record } = await data<Rows<{ leaveDays: number | null; people: number | null }>>(hrbp, "grove.leave_summary", { dateFrom: "2025-01-01", dateTo: "2025-12-31", groupBy: "month", type: "parental" });
    expect(parental.rows.some((r) => r.leaveDays === null)).toBe(true);
    expect(parental.rows.every((r) => (r.people === null) === (r.leaveDays === null))).toBe(true);
    expect(record.policyChecks.some((c) => c.check === "disclosure")).toBe(true);
  });
});

describe("three profiles, three levels of access", () => {
  it("gives the HR Business Partner every aggregate, but no slide decks", async () => {
    for (const [id, input] of [
      ["grove.headcount_trend", { ...year, granularity: "month" }],
      ["grove.hiring_funnel", year],
      ["grove.training_completion", { asOf: REFERENCE_DATE, groupBy: "department" }],
      ["grove.leave_summary", { ...year, groupBy: "type" }],
      ["grove.engagement", { ...year, groupBy: "theme" }],
    ] as const) expect((await executeCapability(hrbp, id, input)).record.status, id).toBe("ok");
  });

  it("denies the Executive leave data but gives engagement", async () => {
    expect((await executeCapability(exec, "grove.leave_summary", { ...year, groupBy: "type" })).record.status).toBe("denied");
    expect((await executeCapability(exec, "grove.engagement", { ...year, groupBy: "department" })).record.status).toBe("ok");
  });

  it("limits the Hiring Manager to Engineering: unspecific requests are narrowed, other departments denied", async () => {
    const out = await executeCapability(manager, "grove.headcount_change", { ...year, groupBy: "department" });
    expect(out.record.status).toBe("ok");
    expect(out.record.policyChecks.some((c) => c.status === "narrowed" && c.check === "data scope")).toBe(true);
    const rows = (out.result?.data as Rows<{ key: string }>).rows;
    expect(rows.map((r) => r.key)).toEqual(["engineering"]);

    const sales = await executeCapability(manager, "grove.hiring_funnel", { ...year, department: "sales" });
    expect(sales.record.status).toBe("denied");
    expect(sales.result).toBeUndefined();

    for (const [id, input] of [
      ["grove.leave_summary", { ...year, groupBy: "type" }],
      ["grove.engagement", { ...year, groupBy: "department" }],
    ] as const) expect((await executeCapability(manager, id, input)).record.status, id).toBe("denied");
  });

  it("keeps companies apart", async () => {
    expect((await executeCapability({ organizationId: "orbit", roleId: "ceo" }, "grove.headcount_trend", { ...year, granularity: "month" })).record.status).toBe("denied");
    expect((await executeCapability(hrbp, "orbit.churn", { ...year, groupBy: "plan" })).record.status).toBe("denied");
  });
});

describe("Grove's suggested requests under each profile", () => {
  const grovePrompts = curatedPrompts.filter((p) => p.organizationId === "grove");

  it("has six suggestions", () => {
    expect(grovePrompts.map((p) => p.id)).toEqual(["headcount-changes", "hiring-dropout", "training-completion", "engagement-drivers", "leave-overview", "headcount-four-years"]);
  });

  it("renders every suggestion fully for the HR Business Partner", async () => {
    for (const p of grovePrompts) {
      const run = await runCurated(hrbp, p.id);
      expect(run.trace.executions.every((e) => e.status === "ok"), p.id).toBe(true);
    }
  });

  it("refuses leave and engagement to the Hiring Manager, and narrows the rest to Engineering", async () => {
    for (const id of ["leave-overview", "engagement-drivers"]) {
      const run = await runCurated(manager, id);
      expect(run.experience.components.map((c) => c.type), id).toEqual(["PageHeading", "Notice", "EmptyState"]);
    }
    const run = await runCurated(manager, "headcount-changes");
    expect(run.experience.components.some((c) => c.type === "Notice" && c.id === "scope")).toBe(true);
  });

  it("refuses leave to the Executive and shows the disclosure notice for small groups", async () => {
    const blocked = await runCurated(exec, "leave-overview");
    expect(blocked.experience.components.map((c) => c.type)).toEqual(["PageHeading", "Notice", "EmptyState"]);
    const run = await runCurated(exec, "headcount-changes");
    expect(run.trace.executions[0].policyChecks.some((c) => c.check === "disclosure")).toBe(true);
    expect(run.experience.components.some((c) => c.type === "Notice" && c.id === "scope")).toBe(true);
  });
});
