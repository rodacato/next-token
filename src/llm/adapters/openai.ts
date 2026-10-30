import type OpenAI from "openai";
import type { Completion, CompletionRequest, CostEstimate, LlmPort } from "../port";
import { roughTokenCount } from "../pricing";

// One adapter for OpenAI and for any OpenAI-compatible server (a base URL is the only difference).
export function openAiAdapter(apiKey: string, model: string, baseURL?: string): LlmPort {
  let sdk: Promise<OpenAI> | undefined;
  const connect = () => (sdk ??= import("openai").then(({ default: OpenAI }) => new OpenAI({ apiKey, dangerouslyAllowBrowser: true, ...(baseURL ? { baseURL } : {}) })));
  const provider = baseURL ? "openai-compatible" : "openai";

  const messages = (request: CompletionRequest) => [
    { role: "system" as const, content: request.system },
    ...request.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  return {
    provider,
    model,
    async estimate(request): Promise<CostEstimate> {
      const text = messages(request)
        .map((m) => m.content)
        .join("\n");
      return { inputTokens: roughTokenCount(text), maxOutputTokens: request.maxTokens, maxUsd: null, exactInputCount: false };
    },
    async complete(request, signal): Promise<Completion> {
      const client = await connect();
      const response = await client.chat.completions.create(
        {
          model,
          max_completion_tokens: request.maxTokens,
          messages: messages(request),
          ...(request.jsonSchema
            ? { response_format: { type: "json_schema" as const, json_schema: { name: "answer", schema: { ...request.jsonSchema } } } }
            : {}),
          ...(request.tools?.length
            ? {
                tools: request.tools.map((t) => ({
                  type: "function" as const,
                  function: { name: t.name, description: t.description, parameters: { type: "object", ...t.inputSchema } },
                })),
              }
            : {}),
        },
        { signal },
      );
      const choice = response.choices[0];
      const toolCalls = (choice?.message.tool_calls ?? []).flatMap((call) =>
        call.type === "function" ? [{ id: call.id, name: call.function.name, input: safeParse(call.function.arguments) }] : [],
      );
      return {
        text: choice?.message.content ?? "",
        toolCalls,
        usage: { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 },
        source: { kind: "live", provider, model: response.model },
      };
    },
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
