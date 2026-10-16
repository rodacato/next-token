import { describe, expect, it } from "vitest";
import { branchId, parseTurn, resolveResult, transcriptPrompt } from "./toolProtocol";

const labels = { customer: "Customer", call: "Your tool call", result: "Tool result" };

describe("tool protocol", () => {
  it("reads a tool call and rejects anything else", () => {
    expect(parseTurn('{"action":"call_tool","tool":"lookup_order","orderId":"50211"}')).toEqual({ action: "call_tool", tool: "lookup_order", orderId: "50211" });
    expect(parseTurn('{"action":"call_tool","tool":"delete_everything"}')).toBeNull();
    expect(parseTurn("Sure, refunding now.")).toBeNull();
  });

  it("echoes the refund that ran", () => {
    const call = { action: "call_tool" as const, tool: "issue_refund" as const, orderId: "50211", amountMxn: 2450 };
    expect(resolveResult({ id: "run-it", result: { status: "refunded" }, echoInput: true }, call)).toEqual({ status: "refunded", orderId: "50211", amountMxn: 2450 });
  });

  it("writes the exchange as one stable prompt with a branch id", () => {
    const call = { action: "call_tool" as const, tool: "lookup_order" as const, orderId: "50211" };
    const steps = [{ call, resultId: "not-found", result: { error: "order not found" } }];
    expect(transcriptPrompt("Refund me.", steps, labels)).toBe(
      'Customer: Refund me.\nYour tool call: {"tool":"lookup_order","input":{"orderId":"50211"}}\nTool result: {"error":"order not found"}',
    );
    expect(branchId([])).toBe("start");
    expect(branchId(steps)).toBe("not-found");
  });
});
