import { requestHash } from "../hash";
import { NoRecordedRunError, type Completion, type CompletionRequest, type LlmPort } from "../port";
import { roughTokenCount } from "../pricing";
import type { RecordedCompletion, RecordedSet } from "../recorded-schema";

export function lastUserPrompt(request: CompletionRequest): string {
  return [...request.messages].reverse().find((m) => m.role === "user")?.content ?? "";
}

// Replays real answers recorded for exactly this system prompt and user prompt; repeats come back in order.
export function recordedAdapter(sets: readonly RecordedSet[]): LlmPort {
  const byHash = new Map<string, { completion: RecordedCompletion; recordedAt: string }[]>();
  for (const set of sets) {
    for (const completion of set.completions) {
      const hash = completion.requestHash;
      const list = byHash.get(hash) ?? [];
      list.push({ completion, recordedAt: set.recordedAt });
      byHash.set(hash, list);
    }
  }
  const served = new Map<string, number>();

  return {
    provider: "recorded",
    model: "recorded",
    async estimate(request) {
      return { inputTokens: 0, maxOutputTokens: request.maxTokens, maxUsd: 0, exactInputCount: true };
    },
    async complete(request): Promise<Completion> {
      const hash = requestHash({ system: request.system, prompt: lastUserPrompt(request), jsonSchema: request.jsonSchema });
      const runs = byHash.get(hash);
      if (!runs?.length) throw new NoRecordedRunError(hash);
      const index = served.get(hash) ?? 0;
      served.set(hash, index + 1);
      const run = runs[index % runs.length];
      if (!run) throw new NoRecordedRunError(hash);
      const { completion, recordedAt } = run;
      return {
        text: completion.output,
        toolCalls: [],
        // The CLI reports nearly all input as cache, padded with its own overhead; estimate from the request instead.
        usage: { inputTokens: roughTokenCount(request.system + request.messages.map((m) => m.content).join("")), outputTokens: completion.usage.outputTokens },
        source: { kind: "recorded", model: completion.model, recordedAt },
      };
    },
  };
}
