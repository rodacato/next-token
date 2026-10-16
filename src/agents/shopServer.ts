import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export type OrderRow = { readonly orderId: string; readonly items: string; readonly totalMxn: number; readonly daysSinceDelivery: number; readonly status: string };
export type Refund = { readonly orderId: string; readonly amountMxn: number };
export type ToolInfo = { readonly name: string; readonly description: string };

// Mercadito's back office as a real MCP server. Lookups read the order system; refunds go to payments,
// which the order system doesn't show. The till records every refund that actually ran.
export function shopServer(orders: readonly OrderRow[], till: Refund[]): McpServer {
  const server = new McpServer({ name: "mercadito-back-office", version: "1.0.0" });
  const text = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });

  server.registerTool(
    "lookup_order",
    { description: "Returns the order's items, total in MXN, days since delivery and delivery status.", inputSchema: { orderId: z.string() } },
    async ({ orderId }) => text(orders.find((o) => o.orderId === orderId) ?? { error: "order not found" }),
  );
  server.registerTool(
    "issue_refund",
    { description: "Refunds the customer through payments. Runs immediately.", inputSchema: { orderId: z.string(), amountMxn: z.number() } },
    async ({ orderId, amountMxn }) => {
      till.push({ orderId, amountMxn });
      return text({ status: "refunded", orderId, amountMxn });
    },
  );
  return server;
}

export type ShopConnection = {
  readonly tools: readonly ToolInfo[];
  call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
  close(): Promise<void>;
};

export async function connectShop(orders: readonly OrderRow[], till: Refund[]): Promise<ShopConnection> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const server = shopServer(orders, till);
  const client = new Client({ name: "next-token-harness", version: "1.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  const { tools } = await client.listTools();
  return {
    tools: tools.map((t) => ({ name: t.name, description: t.description ?? "" })),
    async call(name, args) {
      const result = await client.callTool({ name, arguments: args });
      const first = (result.content as { type: string; text?: string }[])[0];
      return first?.type === "text" && first.text ? (JSON.parse(first.text) as Record<string, unknown>) : {};
    },
    async close() {
      await client.close();
      await server.close();
    },
  };
}
