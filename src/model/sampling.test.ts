import { describe, expect, it } from "vitest";
import {
  drawCandidate,
  drawSort,
  OUTSIDE,
  fanOpenness,
  perplexity,
  seededRandom,
  shapeDistribution,
  tallyDraws,
  type Candidate,
} from "./sampling";

const candidates: Candidate[] = [
  { tokenId: 1, text: " door", logit: 4 },
  { tokenId: 2, text: " shop", logit: 3 },
  { tokenId: 3, text: " oven", logit: 2 },
];
const allLogits = [4, 3, 2, 0, -1, -2];

describe("shapeDistribution", () => {
  it("normalizes over the whole vocabulary, not just the shortlist", () => {
    const d = shapeDistribution(candidates, allLogits, { temperature: 1, topP: 1 });
    const total = d.candidates.reduce((s, c) => s + c.probability, 0) + d.tailMass;
    expect(total).toBeCloseTo(1, 10);
    expect(d.tailMass).toBeGreaterThan(0);
  });

  it("closes the fan as temperature falls and opens it as it rises", () => {
    const cold = shapeDistribution(candidates, allLogits, { temperature: 0.2, topP: 1 });
    const hot = shapeDistribution(candidates, allLogits, { temperature: 2, topP: 1 });
    expect(cold.candidates[0]?.probability).toBeGreaterThan(0.99);
    expect(perplexity(hot)).toBeGreaterThan(perplexity(cold));
    expect(fanOpenness(cold, 3)).toBeLessThan(0.05);
  });

  it("keeps ordering under any temperature", () => {
    for (const temperature of [0.1, 0.7, 1.5]) {
      const d = shapeDistribution(candidates, allLogits, { temperature, topP: 1 });
      const ps = d.candidates.map((c) => c.probability);
      expect([...ps].sort((a, b) => b - a)).toEqual(ps);
    }
  });

  it("always keeps the most likely token in the nucleus", () => {
    const d = shapeDistribution(candidates, allLogits, { temperature: 1, topP: 0.01 });
    expect(d.candidates.map((c) => c.inNucleus)).toEqual([true, false, false]);
  });

  it("treats temperature 0 as greedy without dividing by zero", () => {
    const d = shapeDistribution(candidates, allLogits, { temperature: 0, topP: 1 });
    expect(d.candidates[0]?.probability).toBeCloseTo(1, 6);
  });
});

describe("drawing", () => {
  it("never draws outside the nucleus", () => {
    const d = shapeDistribution(candidates, allLogits, { temperature: 1.5, topP: 0.5 });
    const random = seededRandom(3);
    for (let i = 0; i < 200; i++) expect(drawCandidate(d, random).inNucleus).toBe(true);
  });

  it("is reproducible with a seed", () => {
    const d = shapeDistribution(candidates, allLogits, { temperature: 1, topP: 1 });
    expect(tallyDraws(d, 20, seededRandom(9))).toEqual(tallyDraws(d, 20, seededRandom(9)));
  });

  it("at temperature 0 takes the likeliest sort every time", () => {
    const close: Candidate[] = [
      { tokenId: 1, text: " door", logit: 4 },
      { tokenId: 2, text: " shop", logit: 3.99 },
    ];
    const d = shapeDistribution(close, [4, 3.99], { temperature: 0, topP: 1 });
    const random = seededRandom(5);
    for (let i = 0; i < 500; i++) expect(drawSort(d, random)).toMatchObject({ tokenId: 1 });
  });

  it("draws from the tail past the shortlist as often as the tail's probability", () => {
    const tail = Array.from({ length: 2000 }, () => 1);
    const d = shapeDistribution(candidates, [4, 3, 2, ...tail], { temperature: 2, topP: 1 });
    const random = seededRandom(11);
    let outside = 0;
    for (let i = 0; i < 10_000; i++) if (drawSort(d, random) === OUTSIDE) outside++;
    expect(d.tailMass).toBeGreaterThan(0.5);
    expect(Math.abs(outside / 10_000 - d.tailMass)).toBeLessThan(0.03);
  });

  it("never reaches the tail when top-p closes inside the shortlist", () => {
    const d = shapeDistribution(candidates, allLogits, { temperature: 1, topP: 0.5 });
    const random = seededRandom(3);
    for (let i = 0; i < 500; i++) expect(drawSort(d, random)).not.toBe(OUTSIDE);
  });

  it("finds more distinct sorts when it is hot", () => {
    const cold = shapeDistribution(candidates, allLogits, { temperature: 0.1, topP: 1 });
    const hot = shapeDistribution(candidates, allLogits, { temperature: 1.5, topP: 1 });
    expect(tallyDraws(cold, 20, seededRandom(1)).sorts).toHaveLength(1);
    expect(tallyDraws(hot, 20, seededRandom(1)).sorts.length).toBeGreaterThan(1);
  });
});
