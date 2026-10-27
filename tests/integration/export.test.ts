import { describe, expect, it } from "vitest";
import { POST as exportRoute } from "@/app/api/paa/export/route";
import { runCurated } from "@/lib/paa/orchestration/curated";

const post = (body: unknown, raw?: string) =>
  new Request("http://localhost/api/paa/export", {
    method: "POST",
    body: raw ?? JSON.stringify(body),
    headers: { "x-forwarded-for": `export-test-${Math.random()}` },
  });

async function plan(promptId = "downtime-comparison") {
  const run = await runCurated({ organizationId: "northstar", roleId: "operations_director" }, promptId);
  return { experience: run.experience, calls: run.calls };
}

describe("/api/paa/export", () => {
  it("exports the current view as a PDF, re-running the plan under the caller's role", async () => {
    const res = await exportRoute(post({ organizationId: "northstar", roleId: "operations_director", kind: "pdf", ...(await plan()) }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.deliverables[0].file.filename).toBe("downtime-this-month-against-last-month.pdf");
    expect(Buffer.from(body.deliverables[0].file.base64, "base64").subarray(0, 4).toString()).toBe("%PDF");
    expect(body.executions.map((e: { capabilityId: string }) => e.capabilityId)).toEqual([
      "northstar.downtime_breakdown",
      "northstar.action.apply_branding",
      "northstar.action.export_pdf",
    ]);
  });

  it("blocks decks and email for a supervisor, and generates nothing", async () => {
    for (const kind of ["pptx", "email"]) {
      const res = await exportRoute(post({ organizationId: "northstar", roleId: "line_supervisor", kind, ...(await plan()) }));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.deliverables ?? []).toEqual([]);
      expect(body.actionError).toContain("isn't permitted");
      expect(body.executions.at(-1).status).toBe("denied");
    }
  });

  it("scopes the document's data to the role: a supervisor's PDF only has Dublin figures", async () => {
    const res = await exportRoute(
      post({ organizationId: "northstar", roleId: "line_supervisor", kind: "pdf", ...(await plan("production-by-factory")) }),
    );
    const body = await res.json();
    const table = body.deliverables[0].document.blocks.find((b: { type: string }) => b.type === "table");
    expect(table.rows.map((r: string[]) => r[0])).toEqual(["Dublin Plant"]);
  });

  it("refuses to export data the role may not see", async () => {
    const base = await plan("defect-trend");
    const calls = base.calls.map((c) => ({ ...c, input: { ...c.input, factoryId: "gdansk" } }));
    const res = await exportRoute(
      post({ organizationId: "northstar", roleId: "line_supervisor", kind: "pdf", experience: base.experience, calls }),
    );
    const body = await res.json();
    expect(body.deliverables ?? []).toEqual([]);
    expect(body.actionError).toContain("not available to your role");
  });

  it("rejects malformed bodies", async () => {
    expect((await exportRoute(post({ organizationId: "northstar" }))).status).toBe(400);
    expect((await exportRoute(post(null, "nope"))).status).toBe(400);
    expect((await exportRoute(post(null, "x".repeat(40_000)))).status).toBe(413);
  });
});
