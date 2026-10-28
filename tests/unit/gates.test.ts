import { describe, expect, it } from "vitest";
import { GATES, verdictFor, type LevelId } from "@/lib/gates/gates";

const set = (...l: LevelId[]) => new Set<LevelId>(l);

describe("Four Gates verdicts", () => {
  it("shows nothing until the user has checked", () => {
    expect(verdictFor(set("gold"), "x", false).kind).toBe("empty");
  });
  it("passes strong or gold evidence only when a threshold was declared first", () => {
    expect(verdictFor(set("strong"), "5% conversion", true).kind).toBe("pass");
    expect(verdictFor(set("gold"), "  ", true).kind).toBe("needs-threshold");
  });
  it("asks to test again on weaker evidence, and stops on none", () => {
    expect(verdictFor(set("useful"), "x", true).kind).toBe("retry");
    expect(verdictFor(set(), "x", true).kind).toBe("stop");
  });
  it("defines four gates with the guide's questions and full evidence ladders", () => {
    expect(GATES.map((g) => g.name)).toEqual(["Discovery", "MVP", "Pilot", "Productisation"]);
    for (const g of GATES) {
      expect(g.question.endsWith("?")).toBe(true);
      expect(Object.values(g.levels).every((v) => v.length > 20)).toBe(true);
      expect(g.failures.items).toHaveLength(3);
    }
  });
});
