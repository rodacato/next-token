import { NoRecordedRunError, type Completion, type LlmPort } from "../port";
import { roughTokenCount } from "../pricing";
import { lastUserPrompt } from "./recorded";

export type TableEntry = { readonly input: string; readonly output: string };

// Replays a local model's recorded answers by exact prompt (no system prompt), for runs made outside the Claude CLI.
export function tableAdapter(model: string, recordedAt: string, entries: readonly TableEntry[]): LlmPort {
  const byInput = new Map(entries.map((e) => [e.input, e.output]));
  return {
    provider: "recorded",
    model,
    async estimate(request) {
      return { inputTokens: 0, maxOutputTokens: request.maxTokens, maxUsd: 0, exactInputCount: true };
    },
    async complete(request): Promise<Completion> {
      const prompt = lastUserPrompt(request);
      const output = request.system ? undefined : byInput.get(prompt);
      if (output === undefined) throw new NoRecordedRunError(prompt.slice(0, 40));
      return {
        text: output,
        toolCalls: [],
        usage: { inputTokens: roughTokenCount(prompt), outputTokens: roughTokenCount(output) },
        source: { kind: "recorded", model, recordedAt },
      };
    },
  };
}
