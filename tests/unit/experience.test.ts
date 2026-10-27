import { describe, expect, it } from "vitest";
import { renderTemplate, resolveRef, type Envelope } from "@/lib/paa/schemas/bindings";
import { validateExperience } from "@/lib/paa/schemas/experience";

const envelope: Envelope = {
  results: {
    sales: {
      summary: { total: 1234, rate: 0.0425, name: "Alpha" },
      rows: [
        { label: "A", value: 10 },
        { label: "B", value: 20 },
      ],
    },
  },
};

const wrap = (components: unknown[]) => ({ version: "1", title: "Test", components });

describe("dataRef resolution", () => {
  it("resolves own properties and rejects anything else", () => {
    expect(resolveRef(envelope, "results.sales.summary.total")).toBe(1234);
    expect(resolveRef(envelope, "results.sales.missing")).toBeUndefined();
    expect(resolveRef(envelope, "results.sales.rows.0")).toBeUndefined();
    expect(resolveRef(envelope, "results.__proto__")).toBeUndefined();
    expect(resolveRef(envelope, "results.constructor")).toBeUndefined();
    expect(resolveRef(envelope, "window.location")).toBeUndefined();
    expect(resolveRef(envelope, "results.sales.summary.total + 1")).toBeUndefined();
  });

  it("renders slots with formatting", () => {
    expect(renderTemplate("Total {{results.sales.summary.total|integer}} at {{results.sales.summary.rate|percent}}", envelope)).toBe(
      "Total 1,234 at 4.3%",
    );
  });
});

describe("experience validation", () => {
  it("accepts a well-formed spec bound to real data", () => {
    const result = validateExperience(
      wrap([
        { type: "KpiCard", id: "k", title: "Total", dataRef: "results.sales.summary.total", format: "integer" },
        { type: "BarChart", id: "b", title: "Bars", dataRef: "results.sales.rows", xField: "label", yField: "value" },
        { type: "Narrative", id: "n", template: "Total was {{results.sales.summary.total|integer}} for {{results.sales.summary.name|text}}." },
      ]),
      envelope,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects unknown component types and extra keys", () => {
    expect(validateExperience(wrap([{ type: "Script", id: "x", code: "alert(1)" }]), envelope).ok).toBe(false);
    expect(validateExperience(wrap([{ type: "PageHeading", id: "h", text: "Hi", html: "<b>x</b>" }]), envelope).ok).toBe(false);
  });

  it("rejects references that do not resolve", () => {
    const result = validateExperience(
      wrap([{ type: "KpiCard", id: "k", title: "Total", dataRef: "results.sales.summary.invented", format: "integer" }]),
      envelope,
    );
    expect(result).toMatchObject({ ok: false });
  });

  it("rejects charts bound to missing or non-numeric fields", () => {
    expect(
      validateExperience(wrap([{ type: "BarChart", id: "b", title: "B", dataRef: "results.sales.rows", xField: "label", yField: "nope" }]), envelope).ok,
    ).toBe(false);
    expect(
      validateExperience(wrap([{ type: "BarChart", id: "b", title: "B", dataRef: "results.sales.rows", xField: "label", yField: "label" }]), envelope).ok,
    ).toBe(false);
  });

  it("rejects free-typed numbers in narrative text", () => {
    const result = validateExperience(wrap([{ type: "Narrative", id: "n", template: "Sales rose 14% this quarter." }]), envelope);
    expect(result).toMatchObject({ ok: false });
  });

  it("rejects slots that point at nothing", () => {
    expect(validateExperience(wrap([{ type: "Narrative", id: "n", template: "Total {{results.sales.nothing|integer}}." }]), envelope).ok).toBe(false);
  });

  it("rejects duplicate ids, empty specs and too many components", () => {
    const heading = { type: "PageHeading", id: "h", text: "Hi" };
    expect(validateExperience(wrap([heading, heading]), envelope).ok).toBe(false);
    expect(validateExperience(wrap([]), envelope).ok).toBe(false);
    const many = Array.from({ length: 13 }, (_, i) => ({ type: "PageHeading", id: `h${i}`, text: "Hi" }));
    expect(validateExperience(wrap(many), envelope).ok).toBe(false);
  });

  it("rejects malformed JSON shapes", () => {
    expect(validateExperience(null, envelope).ok).toBe(false);
    expect(validateExperience("<script>", envelope).ok).toBe(false);
    expect(validateExperience({ version: "2", title: "x", components: [] }, envelope).ok).toBe(false);
  });
});
