import { describe, expect, it } from "vitest";
import { runHarness, toolList, type HarnessConfig, type HarnessText, type ModelCall } from "./harness";
import { connectShop, type Refund } from "./shopServer";

const text: HarnessText = {
  system: "Tools:\n{{tools}}",
  subagentSystem: "Summarize.",
  labels: { customer: "Customer", call: "Your tool call", result: "Tool result", notes: "Notes" },
  tickets: [
    { id: "first", message: "Refund order 50211." },
    { id: "again", message: "Refund order 50211 again." },
  ],
  notes: { refunded: "Ticket {ticket}: refunded order {orderId}, {amount} MXN.", none: "Ticket {ticket}: no refund." },
  harnessResults: { blocked: "blocked", declined: "declined" },
  maxTokens: 100,
  refundThreshold: 2000,
};
const orders = [{ orderId: "50211", items: "1 blender", totalMxn: 2450, daysSinceDelivery: 3, status: "delivered" }];

// A scripted agent: look up, refund, then reply. With a note about an earlier refund, it replies at once.
async function scripted(call: ModelCall) {
  if (call.role === "subagent") return { text: "Order 50211: one blender, 2,450 MXN.", tokens: 10 };
  if (call.prompt.includes("refunded order 50211")) return { text: '{"action":"reply","reply":"Already refunded."}', tokens: 5 };
  const text = !call.prompt.includes("lookup_order")
    ? '{"action":"call_tool","tool":"lookup_order","orderId":"50211"}'
    : !call.prompt.includes("issue_refund")
      ? '{"action":"call_tool","tool":"issue_refund","orderId":"50211","amountMxn":2450}'
      : '{"action":"reply","reply":"Done."}';
  return { text, tokens: 5 };
}

async function run(config: Partial<HarnessConfig>, decide: () => "approve" | "decline" | null = () => "approve") {
  const till: Refund[] = [];
  const shop = await connectShop(orders, till);
  const full: HarnessConfig = { refundPolicy: "allow", maxSteps: 8, memory: false, subagent: false, ...config };
  const result = await runHarness({ model: scripted, shop }, { config: full, text, tools: toolList(shop) }, decide);
  await shop.close();
  return { ...result, till };
}

describe("the harness", () => {
  it("lists the MCP server's tools in the system prompt", async () => {
    const shop = await connectShop(orders, []);
    expect(toolList(shop)).toContain("- issue_refund(orderId, amountMxn): Refunds the customer");
    await shop.close();
  });

  it("refunds twice without memory, once with it", async () => {
    expect((await run({})).till).toEqual([
      { orderId: "50211", amountMxn: 2450 },
      { orderId: "50211", amountMxn: 2450 },
    ]);
    const remembered = await run({ memory: true });
    expect(remembered.till).toHaveLength(1);
    expect(remembered.context.notes).toEqual(["Ticket 1: refunded order 50211, 2,450 MXN.", "Ticket 2: no refund."]);
  });

  it("blocks, asks, and caps the loop", async () => {
    const denied = await run({ refundPolicy: "deny" });
    expect(denied.till).toEqual([]);
    expect(denied.context.log[0]?.steps[1]?.via).toBe("blocked");
    const declined = await run({ refundPolicy: "ask" }, () => "decline");
    expect(declined.till).toEqual([]);
    const waiting = await run({ refundPolicy: "ask" }, () => null);
    expect(waiting.waiting).toBe(true);
    const capped = await run({ maxSteps: 1 });
    expect(capped.context.log[0]?.outcome).toBe("step-limit");
    expect(capped.till).toEqual([]);
  });

  it("hands lookups to a sub-agent and the agent sees only its summary", async () => {
    const { context } = await run({ subagent: true });
    const lookup = context.log[0]?.steps[0];
    expect(lookup?.via).toBe("subagent");
    expect(lookup?.result).toEqual({ summary: "Order 50211: one blender, 2,450 MXN." });
    expect(lookup?.raw).toMatchObject({ totalMxn: 2450 });
  });
});
