import type Anthropic from "@anthropic-ai/sdk";
import type { Completion, CompletionRequest, CostEstimate, LlmPort } from "../port";

// BYOK in the browser: the key goes from this device straight to Anthropic, which the learner opted into.
export function anthropicAdapter(apiKey: string, model: string): LlmPort {
  let sdk: Promise<Anthropic> | undefined;
  const connect = () => (sdk ??= import("@anthropic-ai/sdk").then(({ default: Anthropic }) => new Anthropic({ apiKey, dangerouslyAllowBrowser: true })));

  const params = (request: CompletionRequest) => ({
    model,
    max_tokens: request.maxTokens,
    system: request.system,
    messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
    ...(request.tools?.length
      ? {
          tools: request.tools.map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: { type: "object" as const, ...t.inputSchema },
          })),
        }
      : {}),
  });

  return {
    provider: "anthropic",
    model,
    async estimate(request): Promise<CostEstimate> {
      const { system, messages, tools } = params(request);
      const client = await connect();
      const counted = await client.messages.countTokens({ model, system, messages, ...(tools ? { tools } : {}) });
      return { inputTokens: counted.input_tokens, maxOutputTokens: request.maxTokens, maxUsd: null, exactInputCount: true };
    },
    async complete(request, signal): Promise<Completion> {
      const client = await connect();
      const response = await client.messages.create(
        {
          ...params(request),
          ...(request.jsonSchema ? { output_config: { format: { type: "json_schema" as const, schema: request.jsonSchema } } } : {}),
        },
        { signal: signal ?? null },
      );
      if (response.stop_reason === "refusal") throw new Error("The model declined this request.");
      const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
      const toolCalls = response.content.flatMap((block) => (block.type === "tool_use" ? [{ id: block.id, name: block.name, input: block.input }] : []));
      return {
        text,
        toolCalls,
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
        source: { kind: "live", provider: "anthropic", model: response.model },
      };
    },
  };
}
