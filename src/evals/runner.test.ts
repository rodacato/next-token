import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { LlmPort } from "../llm/port";
import { grade, parseJson } from "./graders";
import { runEval } from "./runner";
import type { EvalSet } from "./types";

const fakeLlm = (answers: Record<string, string>): LlmPort => ({
  provider: "recorded",
  model: "fake",
  estimate: async (r) => ({ inputTokens: 0, maxOutputTokens: r.maxTokens, maxUsd: 0, exactInputCount: true }),
  complete: async (r) => ({
    text: answers[r.messages[0]?.content ?? ""] ?? "",
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 2 },
    source: { kind: "recorded", model: "fake", recordedAt: "2026-10-16" },
  }),
});

const set: EvalSet = {
  id: "returns",
  cases: [
    { id: "a", input: { en: "Q: shoes, 10 days" }, expected: { en: "yes" }, tags: [] },
    { id: "b", input: { en: "Q: food, 2 days" }, expected: { en: "no" }, tags: [] },
  ],
  graders: [
    { id: "exact", kind: "exact", caseInsensitive: true },
    { id: "short", kind: "max-words", max: 3 },
  ],
};

describe("runEval", () => {
  it("grades every case and totals the usage", async () => {
    const run = await runEval(set, { id: "plain", system: "", template: "{{input}}" }, {
      locale: "en",
      maxTokens: 10,
      llm: fakeLlm({ "Q: shoes, 10 days": "Yes.", "Q: food, 2 days": "No, because perishable food cannot be returned." }),
    });
    expect(run.passed).toBe(1);
    expect(run.results[1]?.grades.map((g) => g.pass)).toEqual([false, false]);
    expect(run.usage).toEqual({ inputTokens: 20, outputTokens: 4 });
    expect(run.sources).toEqual(["fake · 2026-10-16"]);
  });
});

describe("graders", () => {
  const evalCase = { id: "x", input: { en: "" }, tags: [] };
  const context = (output: string) => ({
    locale: "en",
    evalCase,
    output,
    schemas: { order: z.object({ orderId: z.string() }) },
    judge: async () => ({ pass: true, note: "ok" }),
  });

  it("rejects JSON wrapped in a Markdown fence, as a parser would", async () => {
    const graded = await grade({ id: "s", kind: "json-schema", schemaId: "order" }, context('```json\n{"orderId":"4471"}\n```'));
    expect(graded.pass).toBe(false);
    expect(parseJson('{"orderId":"4471"}').ok).toBe(true);
  });

  it("checks required and forbidden mentions", async () => {
    const all = await grade({ id: "m", kind: "mentions", terms: { en: ["stoneware", "350 ml"] }, mode: "all" }, context("A stoneware mug."));
    const none = await grade({ id: "n", kind: "mentions", terms: { en: ["dishwasher"] }, mode: "none" }, context("Dishwasher safe!"));
    expect(all).toMatchObject({ pass: false, note: "missing: 350 ml" });
    expect(none.pass).toBe(false);
  });
});
