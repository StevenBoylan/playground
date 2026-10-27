import { describe, expect, it } from "vitest";
import type { ModelAdapter, PlanRequest } from "@/lib/paa/orchestration/model-adapter";
import { runIntent, type IntentEvent } from "@/lib/paa/orchestration/orchestrator";
import type { ModelPlan } from "@/lib/paa/orchestration/plan";

const director = { organizationId: "northstar", roleId: "operations_director" };
const supervisor = { organizationId: "northstar", roleId: "line_supervisor" };

/** A fake model that returns scripted plans in order and records what it was asked. */
function scripted(...responses: ModelPlan[]): ModelAdapter & { requests: PlanRequest[] } {
  const requests: PlanRequest[] = [];
  let i = 0;
  return {
    requests,
    async plan(request) {
      requests.push(request);
      return responses[Math.min(i++, responses.length - 1)];
    },
  };
}

type Deliverable = NonNullable<ModelPlan["deliverable"]>;

const plan = (deliverable: Deliverable, over: Partial<ModelPlan> = {}): ModelPlan => ({
  status: "ok",
  intent: "Create a document.",
  assumptions: [],
  calls: [],
  deliverable,
  ...over,
});

const trendCalls: ModelPlan["calls"] = [
  {
    key: "trend",
    capabilityId: "northstar.defect_trend",
    rationale: "Defect rate over time for one line.",
    input: { dateFrom: "2026-07-01", dateTo: "2026-09-30", granularity: "week", lineId: "gdansk-2" },
  },
];

const lorem: Deliverable = {
  kind: "pptx",
  title: "Quarterly update",
  subtitle: "Prepared for the board",
  blocks: [
    { type: "heading", text: "Welcome" },
    { type: "paragraph", template: "Lorem ipsum dolor sit amet, consectetur adipiscing elit." },
    { type: "bullets", items: ["Sed do eiusmod tempor", "Ut enim ad minim veniam"] },
  ],
};

describe("deliverables from free text", () => {
  it("builds a branded deck from the visitor's own text with no service calls", async () => {
    const events: IntentEvent[] = [];
    const result = await runIntent({
      session: director,
      text: "Make a branded pptx with this text: Lorem ipsum dolor sit amet",
      adapter: scripted(plan(lorem)),
      onEvent: (e) => events.push(e),
    });
    expect(result.kind).toBe("deliverable");
    if (result.kind !== "deliverable") return;
    expect(result.deliverable?.file?.filename).toBe("quarterly-update.pptx");
    expect(result.deliverable?.document.brand.name).toBe("Northstar Manufacturing");
    expect(result.trace.executions.map((e) => e.capabilityId)).toEqual(["northstar.action.build_deck"]);
    expect(events.map((e) => e.stage)).toContain("generating");
    expect(events.map((e) => e.stage)).not.toContain("fetching");
  });

  it("turns the current view into a PDF using the same calls, leaving the view alone", async () => {
    const pdfPlan = plan(
      {
        kind: "pdf",
        title: "Gdansk Line 2 quality",
        blocks: [
          {
            type: "paragraph",
            template: "The defect rate moved from {{results.trend.summary.firstPeriodRate|percent}} to {{results.trend.summary.lastPeriodRate|percent}}.",
          },
          { type: "chart", chart: "line", title: "Defect rate by week", dataRef: "results.trend.rows", xField: "label", yField: "defectRate", format: "percent" },
        ],
      },
      { calls: trendCalls },
    );
    const result = await runIntent({ session: director, text: "make a pdf of this", adapter: scripted(pdfPlan) });
    expect(result.kind).toBe("deliverable");
    if (result.kind !== "deliverable") return;
    expect(result.deliverable?.kind).toBe("pdf");
    expect(result.trace.executions.map((e) => e.capabilityId)).toEqual(["northstar.defect_trend", "northstar.action.export_pdf"]);
    const block = result.deliverable?.document.blocks[1];
    expect(block && block.type === "chart" ? block.values.length : 0).toBeGreaterThan(10);
  });

  it("drafts an email without any file and never claims to send it", async () => {
    const emailPlan = plan({
      kind: "email",
      title: "Update",
      to: ["Leadership team"],
      subject: "Weekly update",
      blocks: [{ type: "paragraph", template: "Hello team." }],
    });
    const result = await runIntent({ session: director, text: "email this to the leadership team", adapter: scripted(emailPlan) });
    expect(result.kind).toBe("deliverable");
    if (result.kind !== "deliverable") return;
    expect(result.deliverable?.kind).toBe("email");
    expect(result.deliverable?.file).toBeUndefined();
    expect(result.trace.executions[0].resultSummary).toContain("nothing was sent");
  });

  it("blocks a supervisor from building decks, with the policy check on record", async () => {
    const result = await runIntent({ session: supervisor, text: "make me a pptx", adapter: scripted(plan(lorem)) });
    expect(result.kind).toBe("deliverable");
    if (result.kind !== "deliverable") return;
    expect(result.deliverable).toBeUndefined();
    expect(result.actionError).toContain("isn't permitted to build slide decks");
    expect(result.trace.executions[0]).toMatchObject({ capabilityId: "northstar.action.build_deck", status: "denied" });
  });

  it("asks the model to repair a document with an invented figure, then accepts the fix", async () => {
    const bad: Deliverable = { ...lorem, blocks: [{ type: "paragraph", template: "Output grew 40% last quarter." }] };
    const adapter = scripted(plan(bad), plan(lorem));
    const result = await runIntent({ session: director, text: "make a deck", adapter });
    expect(result.kind).toBe("deliverable");
    expect(adapter.requests[1].repair?.errors.join(" ")).toContain("number outside");
  });

  it("allows figures the visitor typed themselves, and only those", async () => {
    const own: Deliverable = { ...lorem, blocks: [{ type: "paragraph", template: "Target: 95% on-time delivery" }] };
    const ok = await runIntent({ session: director, text: "Make a pptx saying: Target: 95% on-time delivery", adapter: scripted(plan(own)) });
    expect(ok.kind).toBe("deliverable");
    const invented = await runIntent({ session: director, text: "Make a pptx about delivery", adapter: scripted(plan(own)) });
    expect(invented.kind).toBe("error");
  });

  it("returns a view and a document together when the model supplies both", async () => {
    const both: ModelPlan = {
      status: "ok",
      intent: "Show quality and a PDF",
      assumptions: [],
      calls: trendCalls,
      experience: {
        title: "Quality",
        components: [
          { type: "PageHeading", id: "heading", text: "Quality" },
          { type: "LineChart", id: "line", title: "Rate", dataRef: "results.trend.rows", xField: "label", yField: "defectRate", format: "percent" },
        ],
      },
      deliverable: { kind: "pdf", title: "Report", blocks: [{ type: "heading", text: "Quality" }] },
    };
    const result = await runIntent({ session: director, text: "show quality and also a pdf", adapter: scripted(both) });
    expect(result.kind).toBe("experience");
    if (result.kind === "experience") expect(result.deliverable?.kind).toBe("pdf");
  });
});
