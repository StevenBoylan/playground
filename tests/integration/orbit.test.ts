import { describe, expect, it } from "vitest";
import { executeCapability } from "@/lib/paa/capabilities/registry";
import { REFERENCE_DATE } from "@/lib/paa/data/seed";
import { getOrbitDataset } from "@/lib/paa/data/orbit-seed";
import { curatedPrompts, runCurated } from "@/lib/paa/orchestration/curated";
import { resolveRef } from "@/lib/paa/schemas/bindings";

const ceo = { organizationId: "orbit", roleId: "ceo" };
const ops = { organizationId: "orbit", roleId: "head_of_operations" };
const junior = { organizationId: "orbit", roleId: "junior_developer" };
const six = { dateFrom: "2026-04-01", dateTo: REFERENCE_DATE };

async function data<T>(session: typeof ceo, id: string, input: Record<string, unknown>) {
  const out = await executeCapability(session, id, input);
  expect(out.record.status, out.record.error).toBe("ok");
  return { data: out.result?.data as T, record: out.record };
}

type Rows<R> = { rows: R[]; summary: Record<string, number | string | null> };

describe("Orbit's data tells its stories", () => {
  it("has about five hundred customers and four years of monthly revenue that adds up", async () => {
    const ds = getOrbitDataset();
    expect(ds.accounts.length).toBeGreaterThan(400);
    expect(new Set(ds.accountMonths.map((r) => r.month)).size).toBe(48);
    const { data: trend } = await data<Rows<{ mrr: number; netNewMrr: number }>>(ceo, "orbit.mrr_trend", { ...six, granularity: "month" });
    expect(trend.rows).toHaveLength(6);
    // Revenue movement is exact: the change in MRR equals the sum of net new MRR.
    const delta = Number(trend.summary.currentMrr) - Number(trend.summary.startMrr);
    expect(trend.rows.reduce((a, r) => a + r.netNewMrr, 0)).toBe(delta);
    expect(Number(trend.summary.growthPct)).toBeGreaterThan(0);
  });

  it("shows the Growth plan churning after the July price rise, with price as the leading reason", async () => {
    const quarter = { dateFrom: "2026-07-01", dateTo: REFERENCE_DATE };
    const { data: byPlan } = await data<Rows<{ key: string; churnRate: number }>>(ceo, "orbit.churn", { ...quarter, groupBy: "plan" });
    expect(byPlan.summary.highestLabel).toBe("Growth");
    const growth = byPlan.rows.find((r) => r.key === "growth")!;
    const others = byPlan.rows.filter((r) => r.key !== "growth");
    expect(growth.churnRate).toBeGreaterThan(Math.max(...others.map((r) => r.churnRate)));

    const { data: before } = await data<Rows<{ key: string; churnRate: number }>>(ceo, "orbit.churn", { dateFrom: "2026-04-01", dateTo: "2026-06-30", groupBy: "plan" });
    expect(growth.churnRate).toBeGreaterThan(before.rows.find((r) => r.key === "growth")!.churnRate * 1.5);

    const { data: reasons } = await data<Rows<{ label: string }>>(ceo, "orbit.churn", { dateFrom: "2026-07-01", dateTo: REFERENCE_DATE, groupBy: "reason" });
    expect(reasons.rows[0].label).toBe("Price");
  });

  it("shows SMB Starter with the most support and the least adoption", async () => {
    const { data: health } = await data<Rows<{ label: string; ticketsPerCustomer: number; adoptionRate: number }>>(ops, "orbit.segment_health", { dateFrom: "2026-07-01", dateTo: REFERENCE_DATE });
    expect(health.summary.highestSupportLabel).toBe("SMB · Starter");
    expect(health.summary.lowestAdoptionLabel).toBe("SMB · Starter");
  });

  it("shows Integrations bugs jumping after the August release", async () => {
    const { data: byFeature } = await data<Rows<{ label: string }>>(junior, "orbit.support_load", { dateFrom: "2026-07-01", dateTo: REFERENCE_DATE, groupBy: "feature", category: "bug" });
    expect(byFeature.summary.topLabel).toBe("Integrations");
    const { data: trend } = await data<Rows<{ key: string; tickets: number }>>(junior, "orbit.support_load", { dateFrom: "2026-05-01", dateTo: REFERENCE_DATE, groupBy: "month", category: "bug", feature: "integrations" });
    const byMonth = new Map(trend.rows.map((r) => [r.key, r.tickets]));
    expect(byMonth.get("2026-09")!).toBeGreaterThan(byMonth.get("2026-06")! * 5);
  });

  it("remembers the 2024 billing migration as a spike in billing tickets", async () => {
    const { data } = await data2("billing");
    const byMonth = new Map(data.rows.map((r) => [r.key, r.tickets]));
    expect(byMonth.get("2024-03")!).toBeGreaterThan(byMonth.get("2024-01")! * 1.8);
  });

  async function data2(category: string) {
    return data<Rows<{ key: string; tickets: number }>>(ceo, "orbit.support_load", { dateFrom: "2024-01-01", dateTo: "2024-06-30", groupBy: "month", category });
  }
});

describe("three profiles, three levels of access", () => {
  it("lets the CEO see revenue, churned revenue and account MRR", async () => {
    const { data: churn, record } = await data<Rows<{ churnedMrr: number | null }>>(ceo, "orbit.churn", { ...six, groupBy: "plan" });
    expect(typeof churn.summary.churnedMrr).toBe("number");
    expect(churn.rows.every((r) => typeof r.churnedMrr === "number")).toBe(true);
    expect(record.policyChecks.some((c) => c.check === "disclosure")).toBe(false);
    const { data: risk } = await data<Rows<{ mrr: number | null }>>(ceo, "orbit.accounts_at_risk", { asOf: REFERENCE_DATE });
    expect(risk.rows.every((r) => typeof r.mrr === "number")).toBe(true);
  });

  it("shows the Head of Operations churn and named accounts, but redacts revenue (it is not denied)", async () => {
    const { data: churn, record } = await data<Rows<{ churnedMrr: number | null }>>(ops, "orbit.churn", { ...six, groupBy: "plan" });
    expect(churn.summary.churnedMrr).toBeNull();
    expect(churn.rows.every((r) => r.churnedMrr === null)).toBe(true);
    expect(Number(churn.summary.churnedCustomers)).toBeGreaterThan(0);
    // The withholding is a recorded policy event.
    expect(record.policyChecks.find((c) => c.check === "disclosure")).toMatchObject({ status: "narrowed" });

    const { data: risk, record: riskRecord } = await data<Rows<{ name: string; mrr: number | null }>>(ops, "orbit.accounts_at_risk", { asOf: REFERENCE_DATE });
    expect(risk.rows.length).toBeGreaterThan(0);
    expect(risk.rows.every((r) => r.name.length > 0 && r.mrr === null)).toBe(true);
    expect(riskRecord.policyChecks.some((c) => c.check === "disclosure")).toBe(true);
  });

  it("denies the Head of Operations revenue services outright", async () => {
    for (const id of ["orbit.mrr_trend", "orbit.revenue_mix"]) {
      const out = await executeCapability(ops, id, id === "orbit.mrr_trend" ? { ...six, granularity: "month" } : { asOf: REFERENCE_DATE, groupBy: "plan" });
      expect(out.record.status).toBe("denied");
      expect(out.result).toBeUndefined();
    }
  });

  it("gives the junior developer usage and support only: no revenue, churn or named accounts", async () => {
    expect((await executeCapability(junior, "orbit.adoption", { ...six, groupBy: "feature" })).record.status).toBe("ok");
    expect((await executeCapability(junior, "orbit.support_load", { ...six, groupBy: "category" })).record.status).toBe("ok");
    for (const [id, input] of [
      ["orbit.mrr_trend", { ...six, granularity: "month" }],
      ["orbit.revenue_mix", { asOf: REFERENCE_DATE, groupBy: "plan" }],
      ["orbit.churn", { ...six, groupBy: "plan" }],
      ["orbit.accounts_at_risk", { asOf: REFERENCE_DATE }],
    ] as const) {
      const out = await executeCapability(junior, id, input);
      expect(out.record.status, id).toBe("denied");
      expect(out.result).toBeUndefined();
    }
  });

  it("hides small groups from everyone and says so", async () => {
    // Before Enterprise launched there were too few Enterprise customers to report safely.
    const { data: health, record } = await data<Rows<{ label: string; customers: number }>>(ceo, "orbit.segment_health", { dateFrom: "2022-10-01", dateTo: "2022-12-31" });
    expect(health.rows.every((r) => r.customers >= 5)).toBe(true);
    expect(record.policyChecks.some((c) => c.check === "disclosure" && c.detail.includes("fewer than five"))).toBe(true);
  });

  it("keeps companies apart: Orbit roles cannot call Northstar capabilities and the reverse", async () => {
    const dates = { dateFrom: "2026-07-01", dateTo: REFERENCE_DATE };
    expect((await executeCapability(ceo, "northstar.defect_rates", dates)).record.status).toBe("denied");
    expect((await executeCapability({ organizationId: "northstar", roleId: "operations_director" }, "orbit.churn", { ...dates, groupBy: "plan" })).record.status).toBe("denied");
  });

  it("rejects malformed or out-of-range requests without running the service", async () => {
    expect((await executeCapability(ceo, "orbit.churn", { ...six, groupBy: "astrology" })).record.status).toBe("error");
    expect((await executeCapability(ceo, "orbit.accounts_at_risk", { asOf: REFERENCE_DATE, limit: 500 })).record.status).toBe("error");
    expect((await executeCapability(ceo, "orbit.mrr_trend", { ...six, granularity: "month", sql: "drop table" })).record.status).toBe("error");
  });
});

describe("Orbit's suggested requests under each profile", () => {
  const orbitPrompts = curatedPrompts.filter((p) => p.organizationId === "orbit");

  it("has five suggestions", () => {
    expect(orbitPrompts.map((p) => p.id)).toEqual(["mrr-growth", "churn-by-plan", "segment-support-adoption", "bugs-by-feature", "accounts-at-risk"]);
  });

  it("renders every suggestion fully for the CEO, from real data", async () => {
    for (const p of orbitPrompts) {
      const run = await runCurated(ceo, p.id);
      expect(run.trace.executions.every((e) => e.status === "ok"), p.id).toBe(true);
      expect(run.experience.components.some((c) => c.type === "Narrative"), p.id).toBe(true);
    }
  });

  it("blocks revenue-based suggestions for the junior developer and serves the rest", async () => {
    const blocked = ["mrr-growth", "churn-by-plan", "accounts-at-risk"];
    for (const id of blocked) {
      const run = await runCurated(junior, id);
      expect(run.experience.components.map((c) => c.type), id).toEqual(["PageHeading", "Notice", "EmptyState"]);
      expect(run.envelope.results).toEqual({});
    }
    for (const id of ["segment-support-adoption", "bugs-by-feature"]) {
      const run = await runCurated(junior, id);
      expect(run.trace.executions.every((e) => e.status === "ok"), id).toBe(true);
    }
  });

  it("serves churn and accounts to Head of Operations with a notice that revenue is hidden", async () => {
    for (const id of ["churn-by-plan", "accounts-at-risk"]) {
      const run = await runCurated(ops, id);
      expect(run.trace.executions.every((e) => e.status === "ok"), id).toBe(true);
      expect(run.experience.components.some((c) => c.type === "Notice" && c.id === "scope"), id).toBe(true);
      // Revenue shows as withheld, not as zero.
      expect(resolveRef(run.envelope, id === "accounts-at-risk" ? "results.risk.summary.listedMrr" : "results.churn.summary.churnedMrr")).toBeNull();
    }
    const blocked = await runCurated(ops, "mrr-growth");
    expect(blocked.experience.components.map((c) => c.type)).toEqual(["PageHeading", "Notice", "EmptyState"]);
  });
});
