import { z } from "zod";
import { jsonSchemaFor } from "../evals/schemas.ts";
import { chunk, decodeVector, rank, type ChunkStrategy, type Ranked } from "./chunking.ts";

export type RagTask = { readonly system: string; readonly template: string; readonly noExcerpts: string; readonly maxTokens: number };
export type EmbeddingRecording = { readonly model: string; readonly recordedAt: string; readonly passages: Record<string, string>; readonly queries: Record<string, string> };
export const topKs = [0, 1, 2, 3] as const;

export function answerRequest(task: RagTask, question: string, excerpts: readonly string[]) {
  const block = excerpts.length ? excerpts.map((e, i) => `[${i + 1}] ${e.replace(/\n/g, ". ")}`).join("\n") : task.noExcerpts;
  return { system: task.system, prompt: task.template.replaceAll("{{excerpts}}", block).replaceAll("{{question}}", question), maxTokens: task.maxTokens };
}

// Retrieval from recorded vectors; returns null when a chunk or the question was never embedded.
export function rankRecorded(recording: EmbeddingRecording, handbook: string, strategy: ChunkStrategy, fixedSize: number, question: string): Ranked[] | null {
  const query = recording.queries[question];
  if (!query) return null;
  const chunks = chunk(handbook, strategy, fixedSize).map((text) => ({ text, encoded: recording.passages[text] }));
  if (chunks.some((c) => !c.encoded)) return null;
  return rank(decodeVector(query), chunks.map((c) => ({ text: c.text, vector: decodeVector(c.encoded ?? "") })));
}

export type Judgement = "right" | "wrong" | "unsure" | "unreadable";
export type RagJudge = { readonly system: string; readonly template: string };

// Quote first, verdict last: the judge reads before it decides. The schema keeps the verdict parseable.
export const judgementSchema = z.object({ quote: z.string(), verdict: z.enum(["right", "wrong", "unsure"]) });
const judgementJsonSchema = jsonSchemaFor(judgementSchema);

export function judgeRequest(judge: RagJudge, question: string, key: string, reply: string) {
  const prompt = judge.template.replaceAll("{{question}}", question).replaceAll("{{key}}", key).replaceAll("{{reply}}", reply);
  return { system: judge.system, prompt, jsonSchema: judgementJsonSchema, maxTokens: 200 };
}

export function readJudgement(text: string): { verdict: Judgement; note: string } {
  try {
    const parsed = judgementSchema.safeParse(JSON.parse(text));
    return parsed.success ? { verdict: parsed.data.verdict, note: parsed.data.quote } : { verdict: "unreadable", note: text };
  } catch {
    return { verdict: "unreadable", note: text };
  }
}
