import { describe, expect, it } from "vitest";
import { dailyBill } from "./bill";
import { simulateFeature } from "./features";

const haiku = { model: "h", inputPerMTok: 0.1, outputPerMTok: 0.5, cacheWritePerMTok: 0.125, cacheReadPerMTok: 0.01 };
const traffic = { conversationsPerDay: 1000, turnsPerConversation: 3, systemTokens: 2000, contextTokens: 500, userTokens: 50, outputTokens: 150 };

describe("the bill", () => {
  it("prices every token once, and caching only changes the prefix", () => {
    const plain = dailyBill(traffic, haiku, haiku, { strongShare: 0, caching: false, cacheHitRate: 0 });
    // Per conversation: prefixes 2000 + 2200 + 2400, fresh 3 × 550, output 3 × 150.
    expect(plain.totalPerDay).toBeCloseTo(1000 * ((6600 + 1650) * 0.1 + 450 * 0.5) / 1e6, 10);
    const cached = dailyBill(traffic, haiku, haiku, { strongShare: 0, caching: true, cacheHitRate: 1 });
    expect(cached.perDay.cacheReads).toBeCloseTo((1000 * 6600 * 0.01) / 1e6, 10);
    expect(cached.totalPerDay).toBeLessThan(plain.totalPerDay);
  });
});

describe("features", () => {
  const feature = { id: "f", weeklyRequests: 500, wrongCostMxn: 10, personMinutes: 6, approaches: { rules: { coverage: 0.5, accuracy: 1, apiUsdPerRequest: 0, latencyMs: 1 }, search: { coverage: 1, accuracy: 0.5, apiUsdPerRequest: 0, latencyMs: 1 }, llm: { coverage: 1, accuracy: 0.9, apiUsdPerRequest: 0.001, latencyMs: 1 } } };
  const economics = { mxnPerUsd: 20, personMxnPerHour: 120, weeks: 2, seed: 1 };

  it("replays the same month for the same plan", () => {
    expect(simulateFeature(feature, "llm", economics)).toEqual(simulateFeature(feature, "llm", economics));
  });

  it("counts every request once and prices people, mistakes and calls", () => {
    const o = simulateFeature(feature, "rules", economics);
    expect(o.right + o.wrong + o.toPerson).toBe(1000);
    expect(o.personMxn).toBeCloseTo((o.toPerson * 6 * 120) / 60);
    expect(simulateFeature(feature, "llm", economics).apiMxn).toBeCloseTo(1000 * 0.001 * 20);
  });
});
