import { describe, expect, it } from "vitest";
import { projects } from "@/lib/shared/projects";

describe("project registry", () => {
  it("has unique slugs", () => {
    const slugs = projects.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
