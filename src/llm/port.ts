export type ChatMessage = { readonly role: "user" | "assistant"; readonly content: string };

export type ToolSpec = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
};

export type CompletionRequest = {
  readonly system: string;
  readonly messages: readonly ChatMessage[];
  readonly maxTokens: number;
  readonly jsonSchema?: Readonly<Record<string, unknown>>;
  readonly tools?: readonly ToolSpec[];
};

export type ToolCall = { readonly id: string; readonly name: string; readonly input: unknown };

export type LlmSource =
  | { readonly kind: "live"; readonly provider: LlmProvider; readonly model: string }
  | { readonly kind: "recorded"; readonly model: string; readonly recordedAt: string };

export type Completion = {
  readonly text: string;
  readonly toolCalls: readonly ToolCall[];
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
  readonly source: LlmSource;
};

export type LlmProvider = "host" | "anthropic" | "openai" | "openai-compatible" | "recorded";

export type CostEstimate = {
  readonly inputTokens: number;
  readonly maxOutputTokens: number;
  readonly maxUsd: number | null;
  readonly exactInputCount: boolean;
};

export type LlmPort = {
  readonly provider: LlmProvider;
  readonly model: string;
  estimate(request: CompletionRequest): Promise<CostEstimate>;
  complete(request: CompletionRequest, signal?: AbortSignal): Promise<Completion>;
};

export class NoRecordedRunError extends Error {
  constructor(readonly requestHash: string) {
    super("no-recorded-run");
  }
}
