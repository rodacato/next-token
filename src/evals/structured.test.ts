import { describe, expect, it } from "vitest";
import { jsonSchemaFor, orderSheetSchema } from "./schemas";
import { checkSheet, runPress, type StructuredTask } from "./structured";

const good = JSON.stringify({ orderId: "50211", items: [{ name: "blender", quantity: 1 }], refundRequested: true, reason: "damaged" });

const task: StructuredTask = {
  system: "s",
  template: "{{input}}",
  retryTemplate: "{{input}} | {{error}} | {{output}}",
  schema: orderSheetSchema,
  jsonSchema: jsonSchemaFor(orderSheetSchema),
  maxTokens: 100,
  cases: [{ id: "a", input: "order 50211", expected: { orderId: "50211", refundRequested: true, reason: "damaged" } }],
};

describe("the press", () => {
  it("rejects a fenced sheet and names the problem", () => {
    const check = checkSheet("```json\n" + good + "\n```", orderSheetSchema);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toMatch(/not valid JSON/);
  });

  it("rejects a sheet with a bad field, by path", () => {
    const check = checkSheet(JSON.stringify({ ...JSON.parse(good), orderId: "5021" }), orderSheetSchema);
    expect(check).toMatchObject({ ok: false, error: "orderId: orderId must be the five-digit order number" });
  });

  it("retries an asked-nicely sheet once, with the error and the previous reply", async () => {
    const prompts: string[] = [];
    const runs = await runPress(task, "asked", async ({ prompt }) => {
      prompts.push(prompt);
      return { text: prompts.length === 1 ? "```json\n" + good + "\n```" : good, tokens: 10 };
    });
    expect(runs[0]).toMatchObject({ calls: 2, tokens: 20, wrongFields: [] });
    expect(prompts[1]).toContain("not valid JSON");
    expect(prompts[1]).toContain("```json");
  });

  it("sends the JSON Schema only when constrained", async () => {
    const seen: unknown[] = [];
    await runPress(task, "constrained", async (request) => {
      seen.push(request.jsonSchema);
      return { text: good, tokens: 5 };
    });
    expect(seen[0]).toMatchObject({ type: "object", required: ["orderId", "items", "refundRequested", "reason"] });
  });
});
