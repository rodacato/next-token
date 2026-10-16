import { describe, expect, it } from "vitest";
import { recordStep, replayStep } from "./recording";
import { shapeDistribution } from "./sampling";

function fakeLogits(size: number): Float32Array {
  const logits = new Float32Array(size);
  for (let i = 0; i < size; i++) logits[i] = 12 - Math.log(i + 1) * 2.5;
  return logits;
}

describe("recorded runs", () => {
  const logits = fakeLogits(5000);
  const candidates = Array.from({ length: 64 }, (_, tokenId) => ({ tokenId, text: `t${tokenId}`, logit: logits[tokenId] ?? 0 }));
  const step = recordStep("Every morning", { candidates, logits, pieces: [{ tokenId: 1, text: "Every" }, { tokenId: 2, text: " morning" }], elapsedMs: 41.7 });

  it("keeps the vocabulary size", () => {
    expect(replayStep(step).logits).toHaveLength(5000);
  });

  it.each([0.2, 0.8, 1.6])("replays probabilities close to the live run at T=%s", (temperature) => {
    const live = shapeDistribution(candidates, logits, { temperature, topP: 1 });
    const replayed = shapeDistribution(step.candidates, replayStep(step).logits, { temperature, topP: 1 });
    live.candidates.slice(0, 8).forEach((c, i) => expect(replayed.candidates[i]?.probability).toBeCloseTo(c.probability, 3));
    expect(replayed.tailMass).toBeCloseTo(live.tailMass, 2);
  });
});
