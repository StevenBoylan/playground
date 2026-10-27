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

type Deliverable = NonNullable<ModelPlan["deliverables"]>[number];

const plan = (deliverable: Deliverable | Deliverable[], over: Partial<ModelPlan> = {}): ModelPlan => ({
  status: "ok",
  intent: "Create a document.",
  assumptions: [],
  calls: [],
  deliverables: Array.isArray(deliverable) ? deliverable : [deliverable],
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
  branded: true,
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
    expect(result.deliverables?.[0].file?.filename).toBe("quarterly-update.pptx");
    expect(result.deliverables?.[0].document.brand.name).toBe("Northstar Manufacturing");
    expect(result.trace.executions.map((e) => e.capabilityId)).toEqual(["northstar.action.apply_branding", "northstar.action.build_deck"]);
    expect(events.map((e) => e.stage)).toContain("generating");
    expect(events.map((e) => e.stage)).not.toContain("fetching");
  });

  it("turns the current view into a PDF using the same calls, leaving the view alone", async () => {
    const pdfPlan = plan(
      {
        kind: "pdf",
        title: "Gdansk Line 2 quality",
        branded: true,
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
    const result = await runIntent({ session: director, text: "make a branded pdf of this", adapter: scripted(pdfPlan) });
    expect(result.kind).toBe("deliverable");
    if (result.kind !== "deliverable") return;
    expect(result.deliverables?.[0].kind).toBe("pdf");
    expect(result.trace.executions.map((e) => e.capabilityId)).toEqual(["northstar.defect_trend", "northstar.action.apply_branding", "northstar.action.export_pdf"]);
    const block = result.deliverables?.[0].document.blocks[1];
    expect(block && block.type === "chart" ? block.values.length : 0).toBeGreaterThan(10);
  });

  it("drafts an email without any file", async () => {
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
    expect(result.deliverables?.[0].kind).toBe("email");
    expect(result.deliverables?.[0].file).toBeUndefined();
    expect(result.deliverables?.[0].document.brand.name).toBe("Northstar Manufacturing");
  });

  it("blocks a supervisor from building decks, with the policy check on record", async () => {
    const result = await runIntent({ session: supervisor, text: "make me a branded pptx", adapter: scripted(plan(lorem)) });
    expect(result.kind).toBe("deliverable");
    if (result.kind !== "deliverable") return;
    expect(result.deliverables).toEqual([]);
    expect(result.actionError).toContain("isn't permitted to build slide decks");
    expect(result.trace.executions.at(-1)).toMatchObject({ capabilityId: "northstar.action.build_deck", status: "denied" });
  });

  it("asks the model to repair a document with an invented figure, then accepts the fix", async () => {
    const bad: Deliverable = { ...lorem, blocks: [{ type: "paragraph", template: "Output grew 40% last quarter." }] };
    const adapter = scripted(plan(bad), plan(lorem));
    const result = await runIntent({ session: director, text: "make a branded deck", adapter });
    expect(result.kind).toBe("deliverable");
    expect(adapter.requests[1].repair?.errors.join(" ")).toContain("number outside");
  });

  it("allows figures the visitor typed themselves, and only those", async () => {
    const own: Deliverable = { ...lorem, blocks: [{ type: "paragraph", template: "Target: 95% on-time delivery" }] };
    const ok = await runIntent({ session: director, text: "Make a branded pptx saying: Target: 95% on-time delivery", adapter: scripted(plan(own)) });
    expect(ok.kind).toBe("deliverable");
    const invented = await runIntent({ session: director, text: "Make a plain pptx about delivery", adapter: scripted(plan(own)) });
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
      deliverables: [{ kind: "pdf", title: "Report", branded: true, blocks: [{ type: "heading", text: "Quality" }] }],
    };
    const result = await runIntent({ session: director, text: "show quality and also a branded pdf", adapter: scripted(both) });
    expect(result.kind).toBe("experience");
    if (result.kind === "experience") expect(result.deliverables?.[0].kind).toBe("pdf");
  });
});

describe("several documents in one request", () => {
  const report: Deliverable = {
    kind: "pdf",
    title: "Gdansk defect rates",
    branded: true,
    blocks: [{ type: "chart", chart: "line", title: "Defect rate by week", dataRef: "results.trend.rows", xField: "label", yField: "defectRate", format: "percent" }],
  };
  const note: Deliverable = {
    kind: "email",
    title: "Gdansk defect rates",
    to: ["Gdansk team"],
    subject: "Defect rates",
    branded: true,
    blocks: [{ type: "paragraph", template: "The latest defect rates are attached." }],
  };

  it("makes a PDF and the email that carries it, attaching the file whatever order the model lists them in", async () => {
    const result = await runIntent({
      session: director,
      text: "Make a branded PDF of the Gdansk defect rates and email it to the Gdansk team",
      adapter: scripted(plan([note, report], { calls: trendCalls })),
    });
    expect(result.kind).toBe("deliverable");
    if (result.kind !== "deliverable") return;
    expect(result.deliverables?.map((d) => d.kind)).toEqual(["pdf", "email"]);
    expect(result.deliverables?.[1].document.email?.attachments).toEqual([{ filename: "gdansk-defect-rates.pdf", kind: "pdf" }]);
    expect(result.trace.executions.map((e) => e.capabilityId)).toEqual([
      "northstar.defect_trend",
      "northstar.action.apply_branding",
      "northstar.action.export_pdf",
      "northstar.action.draft_email",
    ]);
    expect(result.trace.deliverables?.map((d) => d.kind)).toEqual(["pdf", "email"]);
    expect(result.actionError).toBeUndefined();
  });

  it("does not attach a file that was not produced, and reports the email that was blocked", async () => {
    const plainReport: Deliverable = { ...lorem, kind: "pdf", title: "Gdansk defect rates" };
    const result = await runIntent({
      session: supervisor,
      text: "Make a branded PDF with this text: Lorem ipsum dolor sit amet, and email it to the team",
      adapter: scripted(plan([plainReport, note])),
    });
    expect(result.kind).toBe("deliverable");
    if (result.kind !== "deliverable") return;
    expect(result.deliverables?.map((d) => d.kind)).toEqual(["pdf"]);
    expect(result.actionError).toContain("isn't permitted to draft emails");
    expect(result.trace.executions.at(-1)).toMatchObject({ capabilityId: "northstar.action.draft_email", status: "denied" });
  });
});

describe("the branding skill asks first", () => {
  it("asks about a PDF before spending a model call", async () => {
    const adapter = scripted(plan(lorem));
    const result = await runIntent({ session: director, text: "Make a PDF of the defect rates", adapter });
    expect(result).toMatchObject({ kind: "message", status: "clarify", message: "Do you want this PDF branded?", expects: "branding" });
    expect(adapter.requests).toHaveLength(0);
  });

  it("names a deck, or both documents, in the question", async () => {
    const deck = await runIntent({ session: director, text: "Turn this into a slide deck", adapter: scripted(plan(lorem)) });
    expect(deck).toMatchObject({ message: "Do you want this slide deck branded?" });
    const both = await runIntent({ session: director, text: "Make a pdf and a deck of this", adapter: scripted(plan(lorem)) });
    expect(both).toMatchObject({ message: "Do you want these documents branded?" });
  });

  it("does not ask when the request already says, and leaves the document plain when told to", async () => {
    const adapter = scripted(plan({ ...lorem, kind: "pdf", branded: false }));
    const result = await runIntent({ session: director, text: "Make a plain pdf with this text: Lorem ipsum dolor sit amet", adapter });
    expect(result.kind).toBe("deliverable");
    if (result.kind !== "deliverable") return;
    expect(result.deliverables?.[0].document.brand).toMatchObject({ name: "Report", footer: "Synthetic data" });
    expect(result.trace.executions.map((e) => e.capabilityId)).toEqual(["northstar.action.export_pdf"]);
  });

  it("honours the visitor's words if the model leaves the choice out", async () => {
    const result = await runIntent({
      session: director,
      text: "Make a branded pdf with this text: Lorem ipsum dolor sit amet",
      adapter: scripted(plan({ ...lorem, kind: "pdf", branded: undefined })),
    });
    expect(result.kind).toBe("deliverable");
    if (result.kind === "deliverable") expect(result.deliverables?.[0].document.brand.name).toBe("Northstar Manufacturing");
  });

  it("asks after planning when only the plan reveals a file", async () => {
    const result = await runIntent({
      session: director,
      text: "Send the board a summary of the defect rates",
      adapter: scripted(plan([{ ...lorem, kind: "pdf", branded: undefined }, { kind: "email", title: "Summary", blocks: [{ type: "paragraph", template: "Attached." }] }])),
    });
    expect(result).toMatchObject({ kind: "message", status: "clarify", message: "Do you want this PDF branded?", expects: "branding" });
  });

  it("does not ask about an email on its own, and brands it by default", async () => {
    const adapter = scripted(plan({ kind: "email", title: "Update", blocks: [{ type: "paragraph", template: "Hello team." }] }));
    const result = await runIntent({ session: director, text: "Email the leadership team an update", adapter });
    expect(result.kind).toBe("deliverable");
    if (result.kind === "deliverable") expect(result.deliverables?.[0].document.brand.name).toBe("Northstar Manufacturing");
  });
});
