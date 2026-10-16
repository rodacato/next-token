import { describe, expect, it } from "vitest";
import { monthlyCost, spanishRatio, verdict } from "./tokens-measure";

describe("tokens measurement", () => {
  it("compares totals, not per-pair averages", () => {
    const ratio = spanishRatio({
      tokenizerId: "o200k",
      pairs: [
        { pairId: "a", english: 10, spanish: 12 },
        { pairId: "b", english: 30, spanish: 36 },
      ],
    });
    expect(ratio).toBeCloseTo(1.2);
  });

  it("calls small differences about the same", () => {
    expect(verdict(1.03)).toBe("same");
    expect(verdict(1.2)).toBe("spanish");
    expect(verdict(0.8)).toBe("english");
  });

  it("prices a month of conversations", () => {
    expect(monthlyCost(1200, 50_000, 1)).toBeCloseTo(1800);
  });
});
