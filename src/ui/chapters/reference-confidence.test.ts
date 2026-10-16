import { describe, expect, it } from "vitest";
import { referenceConfidence } from "./reference-confidence";

describe("referenceConfidence", () => {
  it("averages the sorts of each entry and stops at the next one", () => {
    const sorts = [
      { text: " Smith", probability: 0.8 },
      { text: " 2020", probability: 0.4 },
      { text: "\n3.", probability: 0.9 },
      { text: " Lee", probability: 0.2 },
      { text: "\n4.", probability: 0.9 },
      { text: " never", probability: 0.1 },
    ];
    const [first = 0, second = 0] = referenceConfidence(sorts, 2);
    expect(first).toBeCloseTo(0.6);
    expect(second).toBeCloseTo(0.55);
  });
});
