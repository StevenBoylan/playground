import { describe, expect, it } from "vitest";
import { POST as rerun } from "@/app/api/paa/rerun/route";
import { runCurated } from "@/lib/paa/orchestration/curated";

const post = (body: unknown) =>
  new Request("http://localhost/api/paa/rerun", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": `restore-${Math.random()}` } });

describe("a blocked view keeps the layout that was composed", () => {
  it("returns the composed layout alongside a blocked view, so a permitted profile can restore it", async () => {
    // The Executive may not see leave, so the visitor gets a blocked view...
    const blocked = await runCurated({ organizationId: "grove", roleId: "executive" }, "leave-overview");
    expect(blocked.experience.components.map((c) => c.type)).toEqual(["PageHeading", "Notice", "EmptyState"]);
    // ...but the layout that was composed is kept, and it has the real charts in it.
    expect(blocked.base?.components.some((c) => c.type === "LineChart")).toBe(true);

    // Switching to a profile that may see leave re-runs that layout, and the real view comes back.
    const res = await rerun(post({ organizationId: "grove", roleId: "hr_business_partner", experience: blocked.base, calls: blocked.calls }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.experience.components.some((c: { type: string }) => c.type === "LineChart")).toBe(true);
    expect(body.executions.every((e: { status: string }) => e.status === "ok")).toBe(true);
  });

  it("does not add a base when nothing was blocked", async () => {
    const run = await runCurated({ organizationId: "grove", roleId: "hr_business_partner" }, "leave-overview");
    expect(run.base).toBeUndefined();
  });

  it("works the same way across companies", async () => {
    const blocked = await runCurated({ organizationId: "orbit", roleId: "junior_developer" }, "mrr-growth");
    expect(blocked.base?.components.some((c) => c.type === "LineChart")).toBe(true);
    const res = await rerun(post({ organizationId: "orbit", roleId: "ceo", experience: blocked.base, calls: blocked.calls }));
    const body = await res.json();
    expect(body.experience.components.some((c: { type: string }) => c.type === "LineChart")).toBe(true);
  });
});
