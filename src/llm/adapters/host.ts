import { z } from "zod";
import type { HostBridge } from "../../host/HostBridge";
import type { Completion, CostEstimate, LlmPort } from "../port";
import { roughTokenCount } from "../pricing";

// The host fulfils `llm {task: "complete"}` with its configured model; the shape is our proposal (ADR 5).
const hostCompletionSchema = z.object({
  text: z.string(),
  toolCalls: z.array(z.object({ id: z.string(), name: z.string(), input: z.unknown() })).default([]),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number() }).default({ inputTokens: 0, outputTokens: 0 }),
  model: z.string().default("host"),
});

export function hostAdapter(bridge: HostBridge): LlmPort {
  return {
    provider: "host",
    model: "host",
    async estimate(request): Promise<CostEstimate> {
      const text = [request.system, ...request.messages.map((m) => m.content)].join("\n");
      return { inputTokens: roughTokenCount(text), maxOutputTokens: request.maxTokens, maxUsd: null, exactInputCount: false };
    },
    async complete(request): Promise<Completion> {
      const output = await bridge.askHost("complete", request);
      if (output === null) throw new Error("The host did not answer.");
      const parsed = hostCompletionSchema.parse(output);
      return { text: parsed.text, toolCalls: parsed.toolCalls, usage: parsed.usage, source: { kind: "live", provider: "host", model: parsed.model } };
    },
  };
}
