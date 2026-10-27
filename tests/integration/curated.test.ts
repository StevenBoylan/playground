import { describe, expect, it } from "vitest";
import { curatedPrompts, runCurated, RunError } from "@/lib/paa/orchestration/curated";
import { formatValue } from "@/lib/paa/format";
import { renderTemplate, resolveRef } from "@/lib/paa/schemas/bindings";

const director = { organizationId: "northstar", roleId: "operations_director" };
const supervisor = { organizationId: "northstar", roleId: "line_supervisor" };

type Row = Record<string, number | string>;

describe("curated Northstar journeys", () => {
  for (const prompt of curatedPrompts) {
    it(`"${prompt.text}" renders a valid experience from recorded service calls`, async () => {
      const run = await runCurated(director, prompt.id);
      expect(run.trace.executions.length).toBeGreaterThan(0);
      expect(run.trace.executions.every((e) => e.status === "ok" && e.provenance)).toBe(true);
      expect(run.trace.experience.componentCount).toBe(run.experience.components.length);
      // Every bound result in the envelope came from a recorded execution.
      expect(Object.keys(run.envelope.results).length).toBe(run.trace.executions.length);
    });
  }

  it("shows the planted anomalies: Gdansk Line 2 has the worst defect rate and Monterrey's conveyor drives downtime", async () => {
    const defects = await runCurated(director, "highest-defect-lines");
    expect(resolveRef(defects.envelope, "results.defects.summary.worstLineLabel")).toBe("Gdansk Line 2");

    const downtime = await runCurated(director, "downtime-comparison");
    expect(resolveRef(downtime.envelope, "results.downtime.summary.topIncreaseCause")).toBe("Conveyor failure");
    expect(Number(resolveRef(downtime.envelope, "results.downtime.summary.changePct"))).toBeGreaterThan(0);
  });

  it("displays exactly the values the services returned", async () => {
    const run = await runCurated(director, "production-by-factory");
    const narrative = run.experience.components.find((c) => c.type === "Narrative");
    expect(narrative).toBeDefined();
    if (narrative?.type !== "Narrative") return;

    const total = Number(resolveRef(run.envelope, "results.production.summary.totalUnits"));
    const rate = Number(resolveRef(run.envelope, "results.production.summary.defectRate"));
    const text = renderTemplate(narrative.template, run.envelope);
    expect(text).toContain(formatValue(total, "integer"));
    expect(text).toContain(formatValue(rate, "percent"));

    // Factory rows add up to the headline total.
    const rows = resolveRef(run.envelope, "results.production.rows") as Row[];
    expect(rows.reduce((a, r) => a + Number(r.unitsProduced), 0)).toBe(total);
  });

  it("gives the supervisor a narrowed view and a scope notice", async () => {
    const run = await runCurated(supervisor, "production-by-factory");
    const rows = resolveRef(run.envelope, "results.production.rows") as Row[];
    expect(rows.map((r) => r.key)).toEqual(["dublin"]);
    expect(run.experience.components.some((c) => c.type === "Notice")).toBe(true);
    expect(run.trace.executions[0].policyChecks.some((c) => c.status === "narrowed")).toBe(true);
  });

  it("rejects unknown prompts and prompts for another organization", async () => {
    await expect(runCurated(director, "nope")).rejects.toBeInstanceOf(RunError);
    await expect(runCurated({ organizationId: "orbit", roleId: "finance" }, "production-by-factory")).rejects.toBeInstanceOf(RunError);
  });

  it("returns a blocked experience, not fabricated data, when policy denies a call", async () => {
    const run = await runCurated({ organizationId: "northstar", roleId: "nonexistent" }, "production-by-factory");
    expect(run.trace.executions.every((e) => e.status === "denied")).toBe(true);
    expect(run.experience.components.map((c) => c.type)).toEqual(["PageHeading", "Notice", "EmptyState"]);
    expect(run.envelope.results).toEqual({});
  });
});
