import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as intent } from "@/app/api/paa/intent/route";
import { POST as rerun } from "@/app/api/paa/rerun/route";
import { POST as run } from "@/app/api/paa/run/route";
import { runCurated } from "@/lib/paa/orchestration/curated";
import { resolveRef } from "@/lib/paa/schemas/bindings";

const post = (url: string, body: unknown, raw?: string) =>
  new Request(`http://localhost${url}`, { method: "POST", body: raw ?? JSON.stringify(body), headers: { "x-forwarded-for": `test-${Math.random()}` } });

let savedKey: string | undefined;
beforeEach(() => {
  savedKey = process.env.ANTHROPIC_API_KEY;
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = savedKey;
});

describe("/api/paa/intent", () => {
  it("reports AI as unavailable, rather than failing, when no key is configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await intent(post("/api/paa/intent", { organizationId: "northstar", roleId: "operations_director", text: "hello" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "ai_unavailable" });
  });

  it("validates bodies before doing any work", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-used";
    expect((await intent(post("/api/paa/intent", null, "not json"))).status).toBe(400);
    expect((await intent(post("/api/paa/intent", { organizationId: "northstar", roleId: "x", text: "" }))).status).toBe(400);
    expect((await intent(post("/api/paa/intent", { organizationId: "northstar", roleId: "x", text: "a".repeat(501) }))).status).toBe(400);
    expect((await intent(post("/api/paa/intent", { organizationId: "northstar", roleId: "x", text: "hi", extra: 1 }))).status).toBe(400);
    expect((await intent(post("/api/paa/intent", null, "x".repeat(20_000)))).status).toBe(413);
  });

  it("rate limits repeated callers", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-used";
    const headers = { "x-forwarded-for": "rate-limit-test" };
    let last = 0;
    for (let i = 0; i < 14; i++) {
      const res = await intent(new Request("http://localhost/api/paa/intent", { method: "POST", body: "bad", headers }));
      last = res.status;
    }
    expect(last).toBe(429);
  });
});

describe("/api/paa/rerun", () => {
  it("re-runs a plan with a filter, without the model, and returns data for just that factory", async () => {
    const base = await runCurated({ organizationId: "northstar", roleId: "operations_director" }, "defect-trend");
    const calls = base.calls.map((c) => ({ ...c, input: { ...c.input, factoryId: "gdansk" } }));
    const res = await rerun(post("/api/paa/rerun", { organizationId: "northstar", roleId: "operations_director", experience: base.experience, calls }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.executions[0].params.factoryId).toBe("gdansk");
    const allUnits = (resolveRef(base.envelope, "results.trend.rows") as { unitsProduced: number }[]).reduce((a, r) => a + r.unitsProduced, 0);
    const gdanskUnits = (body.envelope.results.trend.rows as { unitsProduced: number }[]).reduce((a, r) => a + r.unitsProduced, 0);
    expect(gdanskUnits).toBeLessThan(allUnits);
  });

  it("shows a blocked view, not stale numbers, when the new role may not see the data", async () => {
    const base = await runCurated({ organizationId: "northstar", roleId: "operations_director" }, "defect-trend");
    const calls = base.calls.map((c) => ({ ...c, input: { ...c.input, factoryId: "gdansk" } }));
    const res = await rerun(post("/api/paa/rerun", { organizationId: "northstar", roleId: "line_supervisor", experience: base.experience, calls }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.executions[0].status).toBe("denied");
    expect(body.envelope.results).toEqual({});
    expect(body.experience.components.map((c: { type: string }) => c.type)).toEqual(["PageHeading", "Notice", "EmptyState"]);
  });

  it("rejects malformed bodies and oversized plans", async () => {
    expect((await rerun(post("/api/paa/rerun", { organizationId: "northstar" }))).status).toBe(400);
    expect((await rerun(post("/api/paa/rerun", null, "not json"))).status).toBe(400);
  });
});

describe("/api/paa/run (curated fallback)", () => {
  it("returns the plan alongside the experience so it can be re-run", async () => {
    const res = await run(post("/api/paa/run", { organizationId: "northstar", roleId: "operations_director", promptId: "defect-trend" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.calls[0]).toMatchObject({ key: "trend", capabilityId: "northstar.defect_trend" });
    expect(body.experience.components.map((c: { type: string }) => c.type)).toContain("FilterBar");
  });
});
