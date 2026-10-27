import { describe, expect, it } from "vitest";
import { parsePlanText } from "@/lib/paa/orchestration/plan";

const plan = {
  status: "ok",
  intent: "Show defects",
  assumptions: [],
  calls: [{ key: "d", capabilityId: "northstar.defect_rates", rationale: "ranks lines", input: { dateFrom: "2026-07-01", dateTo: "2026-09-30" } }],
  experience: { title: "Defects", components: [{ type: "PageHeading", id: "heading", text: "Defects" }] },
};

describe("parsePlanText", () => {
  it("accepts plain JSON, fenced JSON and JSON surrounded by prose", () => {
    const json = JSON.stringify(plan);
    expect(parsePlanText(json).ok).toBe(true);
    expect(parsePlanText("```json\n" + json + "\n```").ok).toBe(true);
    expect(parsePlanText("Here is the plan:\n" + json + "\nHope that helps.").ok).toBe(true);
  });

  it("ignores null optionals the model may emit", () => {
    const withNulls = { ...plan, message: null, experience: { title: "x", components: [{ type: "PageHeading", id: "h", text: "x", subtitle: null }] } };
    expect(parsePlanText(JSON.stringify(withNulls)).ok).toBe(true);
  });

  it("rejects non-JSON, wrong shapes and unknown component types with a usable message", () => {
    expect(parsePlanText("I can't do that")).toMatchObject({ ok: false });
    expect(parsePlanText('{"status":"ok"}')).toMatchObject({ ok: false });
    const bad = { ...plan, experience: { title: "x", components: [{ type: "Script", id: "s" }] } };
    const result = parsePlanText(JSON.stringify(bad));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });
});
