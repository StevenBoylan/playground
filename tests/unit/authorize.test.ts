import { describe, expect, it } from "vitest";
import { DATASET_VERSION } from "@/lib/paa/data/seed";
import { executeCapability } from "@/lib/paa/capabilities/registry";

const supervisor = { organizationId: "northstar", roleId: "line_supervisor" };
const director = { organizationId: "northstar", roleId: "operations_director" };
const q3 = { dateFrom: "2026-07-01", dateTo: "2026-09-30" };

describe("policy enforcement", () => {
  it("lets the director see every factory", async () => {
    const out = await executeCapability(director, "northstar.production_summary", { ...q3, groupBy: "factory" });
    expect(out.record.status).toBe("ok");
    const rows = (out.result?.data as { rows: { key: string }[] }).rows;
    expect(rows.map((r) => r.key).sort()).toEqual(["dublin", "gdansk", "monterrey"]);
  });

  it("narrows an unrestricted supervisor request to their own factory and records it", async () => {
    const out = await executeCapability(supervisor, "northstar.production_summary", { ...q3, groupBy: "factory" });
    expect(out.record.status).toBe("ok");
    expect(out.record.policyChecks.some((c) => c.status === "narrowed")).toBe(true);
    const rows = (out.result?.data as { rows: { key: string }[] }).rows;
    expect(rows.map((r) => r.key)).toEqual(["dublin"]);
  });

  it("denies a supervisor asking for another factory, even by direct call", async () => {
    const out = await executeCapability(supervisor, "northstar.defect_rates", { ...q3, factoryId: "gdansk" });
    expect(out.record.status).toBe("denied");
    expect(out.result).toBeUndefined();
  });

  it("denies unknown capabilities, unknown roles and unknown organizations", async () => {
    expect((await executeCapability(director, "northstar.drop_tables", {})).record.status).toBe("denied");
    expect((await executeCapability({ organizationId: "northstar", roleId: "ceo" }, "northstar.defect_rates", q3)).record.status).toBe("denied");
    expect((await executeCapability({ organizationId: "nowhere", roleId: "x" }, "northstar.defect_rates", q3)).record.status).toBe("denied");
  });

  it("denies a session from another organization calling a Northstar capability", async () => {
    const out = await executeCapability({ organizationId: "orbit", roleId: "finance" }, "northstar.defect_rates", q3);
    expect(out.record.status).toBe("denied");
    expect(out.result).toBeUndefined();
  });

  it("rejects malformed input and unexpected fields without running the service", async () => {
    const bad = await executeCapability(director, "northstar.defect_rates", { dateFrom: "yesterday", dateTo: "2026-09-30" });
    expect(bad.record.status).toBe("error");
    const extra = await executeCapability(director, "northstar.defect_rates", { ...q3, sql: "select * from users" });
    expect(extra.record.status).toBe("error");
    const reversed = await executeCapability(director, "northstar.defect_rates", { dateFrom: "2026-09-30", dateTo: "2026-07-01" });
    expect(reversed.record.status).toBe("error");
  });

  it("reports an unknown factory as an error rather than leaking internals", async () => {
    const out = await executeCapability(director, "northstar.defect_rates", { ...q3, factoryId: "atlantis" });
    expect(out.record.status).toBe("error");
    expect(out.record.error).toBe("Unknown factory");
  });

  it("attaches provenance to successful results", async () => {
    const out = await executeCapability(director, "northstar.defect_rates", q3);
    expect(out.result?.provenance).toMatchObject({ service: "northstar.defect_rates", datasetVersion: DATASET_VERSION });
    expect(out.result?.provenance.resultId).toMatch(/^[0-9a-f]{12}$/);
  });
});
