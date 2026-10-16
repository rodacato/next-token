import { describe, expect, it } from "vitest";
import { answerRequest, readJudgement } from "./answer";
import { chunk, cosine, decodeVector, encodeVector } from "./chunking";

const handbook = "Returns\nWithin 30 days.\n\nElectronics\nHeadphones count as electronics. They have 15 days.";

describe("chunking", () => {
  it("cuts by section, by sentence, or blindly by size", () => {
    expect(chunk(handbook, "section", 40)).toEqual(["Returns\nWithin 30 days.", "Electronics\nHeadphones count as electronics. They have 15 days."]);
    expect(chunk(handbook, "sentence", 40)).toContain("They have 15 days.");
    expect(chunk(handbook, "fixed", 40)).toEqual(["Returns\nWithin 30 days. Electronics\nHead", "phones count as electronics. They have 1", "5 days."]);
  });

  it("round-trips vectors and measures cosine", () => {
    const v = new Float32Array([0.6, 0.8]);
    expect(Array.from(decodeVector(encodeVector(v)))).toEqual(Array.from(v));
    expect(cosine(v, v)).toBeCloseTo(1);
    expect(cosine(v, new Float32Array([0.8, -0.6]))).toBeCloseTo(0);
  });
});

describe("answers", () => {
  it("numbers the excerpts and says when there are none", () => {
    const task = { system: "s", template: "E:\n{{excerpts}}\nQ: {{question}}", noExcerpts: "(none)", maxTokens: 10 };
    expect(answerRequest(task, "Why?", ["A\nB", "C"]).prompt).toBe("E:\n[1] A. B\n[2] C\nQ: Why?");
    expect(answerRequest(task, "Why?", []).prompt).toBe("E:\n(none)\nQ: Why?");
  });

  it("reads the judge's verdict, or says it couldn't", () => {
    expect(readJudgement('{"quote":"15 days","verdict":"right"}')).toEqual({ verdict: "right", note: "15 days" });
    expect(readJudgement("RIGHT").verdict).toBe("unreadable");
  });
});
