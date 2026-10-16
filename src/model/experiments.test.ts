import { describe, expect, it } from "vitest";
import type { FabricationChapter, StickChapter } from "../content/schema";
import { composeSampled, needleContext, needleDepths, penalizeRepeats, splitReferences, tokenProbability, type Reader } from "./experiments";

const stick = {
  needle: {
    positions: 3,
    fact: { en: "NEEDLE" },
    question: { en: "Q?" },
    answer: " A",
    haystack: { en: ["a", "b", "c", "d"] },
  },
} as unknown as StickChapter;

describe("lost in the middle", () => {
  it("spreads depths from start to end", () => {
    expect(needleDepths(3)).toEqual([0, 0.5, 1]);
  });

  it("places the needle at the requested depth and asks at the end", () => {
    expect(needleContext(stick, "en", 0)).toBe("NEEDLE\na\nb\nc\nd\n\nQ?");
    expect(needleContext(stick, "en", 0.5)).toBe("a\nb\nNEEDLE\nc\nd\n\nQ?");
    expect(needleContext(stick, "en", 1)).toBe("a\nb\nc\nd\nNEEDLE\n\nQ?");
  });

  it("measures probability and rank over the whole vocabulary", () => {
    const { probability, rank } = tokenProbability([0, Math.log(3), 0], 1);
    expect(probability).toBeCloseTo(0.6);
    expect(rank).toBe(1);
    expect(tokenProbability([0, Math.log(3), 0], 0).rank).toBe(2);
  });
});

describe("fluent is not true", () => {
  const chapter = { maxTokens: 50, references: 2, sampling: { temperature: 0.7, topP: 1, seed: 1, repetitionPenalty: 1 } } as FabricationChapter;

  it("writes one line per entry and sets the numbers itself", async () => {
    const script = [" First", " part\n", " Second", "<|endoftext|>", " never"];
    let step = 0;
    const read: Reader = async () => {
      const text = script[step++] ?? "";
      return { candidates: [{ tokenId: step, text, logit: 1 }], logits: new Float32Array(8).fill(0).map((_, i) => (i === step ? 1 : 0)), pieces: [], elapsedMs: 0 };
    };
    const sorts = await composeSampled(chapter, "1. Real.\n2.", read);
    expect(sorts.map((s) => s.text).join("")).toBe(" First part\n3. Second");
    expect(sorts.filter((s) => s.given).map((s) => s.text)).toEqual(["\n3."]);
    expect(splitReferences("1. Real.\n2.", sorts, 2)).toEqual(["First part", "Second"]);
  });
});

describe("penalizeRepeats", () => {
  it("lowers used tokens and re-sorts the shortlist", () => {
    const reading = {
      candidates: [
        { tokenId: 0, text: " Do", logit: 4 },
        { tokenId: 1, text: " Not", logit: 3.5 },
      ],
      logits: new Float32Array([4, 3.5, -1]),
      pieces: [],
      elapsedMs: 0,
    };
    const penalized = penalizeRepeats(reading, new Set([0, 2]), 2);
    expect(penalized.candidates.map((c) => c.text)).toEqual([" Not", " Do"]);
    expect(Array.from(penalized.logits)).toEqual([2, 3.5, -2]);
  });
});
