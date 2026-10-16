import { describe, expect, it } from "vitest";
import { recordedAdapter } from "./adapters/recorded";
import { BudgetExceededError, guarded, SessionBudget, UnknownPriceError } from "./costGuard";
import { requestHash } from "./hash";
import { NoRecordedRunError, type LlmPort } from "./port";
import { costUsd, listedPrice } from "./pricing";
import type { RecordedSet } from "./recorded-schema";

const echo: LlmPort = {
  provider: "anthropic",
  model: "claude-haiku-5-5",
  estimate: async (r) => ({ inputTokens: 1_000, maxOutputTokens: r.maxTokens, maxUsd: null, exactInputCount: true }),
  complete: async () => ({ text: "ok", toolCalls: [], usage: { inputTokens: 1_000, outputTokens: 200 }, source: { kind: "live", provider: "anthropic", model: "claude-haiku-5-5" } }),
};
const request = { system: "s", messages: [{ role: "user" as const, content: "hi" }], maxTokens: 1_000 };

describe("cost guard", () => {
  const price = listedPrice("claude-haiku-5-5");

  it("prices from the dated table", () => {
    expect(price).not.toBeNull();
    if (price) expect(costUsd(price, 1_000_000, 0)).toBeCloseTo(0.1);
  });

  it("counts what was spent and refuses past the cap", async () => {
    const budget = new SessionBudget(0.0006);
    const port = guarded(echo, budget, price);
    await port.complete(request);
    expect(budget.spentUsd).toBeCloseTo((1_000 * 0.1 + 200 * 0.5) / 1_000_000);
    await expect(port.complete(request)).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it("refuses to run a model it cannot price", async () => {
    await expect(guarded(echo, new SessionBudget(1), null).complete(request)).rejects.toBeInstanceOf(UnknownPriceError);
  });
});

describe("recorded adapter", () => {
  const hash = requestHash({ system: "s", prompt: "hi" });
  const set: RecordedSet = {
    recipeId: "r",
    recordedAt: "2026-10-16",
    via: "claude-code-cli",
    temperature: "provider-default",
    completions: [1, 2].map((attempt) => ({
      requestId: "q",
      requestHash: hash,
      locale: "en",
      attempt,
      model: "claude-haiku-5-5",
      system: "s",
      prompt: "hi",
      output: `answer ${attempt}`,
      usage: { inputTokens: 1, outputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 0 },
      listCostUsd: 0,
      durationMs: 1,
    })),
  };

  it("replays repeats in order and labels them", async () => {
    const port = recordedAdapter([set]);
    expect((await port.complete(request)).text).toBe("answer 1");
    const second = await port.complete(request);
    expect(second.text).toBe("answer 2");
    expect(second.source).toEqual({ kind: "recorded", model: "claude-haiku-5-5", recordedAt: "2026-10-16" });
  });

  it("says so when nothing was recorded for a request", async () => {
    await expect(recordedAdapter([set]).complete({ ...request, system: "other" })).rejects.toBeInstanceOf(NoRecordedRunError);
  });

  it("hashes independently of key order", () => {
    expect(requestHash({ system: "a", prompt: "b", jsonSchema: { x: 1, y: 2 } })).toBe(requestHash({ prompt: "b", system: "a", jsonSchema: { y: 2, x: 1 } }));
  });
});
