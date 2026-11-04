import { describe, expect, it } from "vitest";
import { projects } from "@/lib/shared/projects";

describe("project registry", () => {
  it("has unique slugs", () => {
    const slugs = projects.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("lists the projects in the intended order, with only the architecture demo gated", () => {
    expect(projects.map((p) => p.slug)).toEqual(["lim", "paa", "4gates"]);
    expect(projects.filter((p) => p.gated).map((p) => p.slug)).toEqual(["paa"]);
  });

  it("gives every card a headline, a subtitle, both columns and a call to action", () => {
    for (const p of projects) {
      expect(p.headline.endsWith("?")).toBe(true);
      expect(p.subtitle).toContain(" · ");
      expect(p.origin.paragraphs.length).toBeGreaterThan(0);
      expect(p.idea.paragraphs.length).toBeGreaterThan(0);
      expect(p.example.paragraphs.length).toBeGreaterThan(0);
      expect(p.example.cta.length).toBeGreaterThan(0);
    }
  });
});
