import { z } from "zod";
import type { FabricationChapter, StickChapter } from "../content/schema.ts";
import type { NextTokenResult } from "./client.ts";
import { drawCandidate, seededRandom, shapeDistribution } from "./sampling.ts";

export type Reader = (context: string) => Promise<NextTokenResult>;

// ---- Lost in the middle ----------------------------------------------------

export function needleDepths(positions: number): number[] {
  return Array.from({ length: positions }, (_, i) => i / (positions - 1));
}

export function needleContext(chapter: StickChapter, locale: string, depth: number): string {
  const facts = chapter.needle.haystack[locale] ?? [];
  const needle = chapter.needle.fact[locale] ?? "";
  const question = chapter.needle.question[locale] ?? "";
  const at = Math.round(depth * facts.length);
  const notes = [...facts.slice(0, at), needle, ...facts.slice(at)];
  return `${notes.join("\n")}\n\n${question}`;
}

export function tokenProbability(logits: ArrayLike<number>, tokenId: number): { probability: number; rank: number } {
  const target = logits[tokenId] ?? -Infinity;
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) max = Math.max(max, logits[i] ?? -Infinity);
  let normalizer = 0;
  let above = 0;
  for (let i = 0; i < logits.length; i++) {
    const logit = logits[i] ?? -Infinity;
    normalizer += Math.exp(logit - max);
    if (logit > target) above++;
  }
  return { probability: Math.exp(target - max) / normalizer, rank: above + 1 };
}

export const needleResultSchema = z.object({
  depth: z.number().min(0).max(1),
  contextTokens: z.number().int().positive(),
  probability: z.number().min(0).max(1),
  rank: z.number().int().positive(),
});

export type NeedleResult = z.infer<typeof needleResultSchema>;

export async function runNeedle(chapter: StickChapter, locale: string, answerTokenId: number, read: Reader): Promise<NeedleResult[]> {
  const results: NeedleResult[] = [];
  for (const depth of needleDepths(chapter.needle.positions)) {
    const reading = await read(needleContext(chapter, locale, depth));
    results.push({ depth, contextTokens: reading.pieces.length, ...tokenProbability(reading.logits, answerTokenId) });
  }
  return results;
}

// ---- Fluent is not true ----------------------------------------------------

export const composedSortSchema = z.object({ text: z.string(), probability: z.number().min(0).max(1), given: z.boolean().optional() });
export type ComposedSort = z.infer<typeof composedSortSchema>;

export function firstEntryNumber(prompt: string): number {
  return Number(/(\d+)\.\s*$/.exec(prompt)?.[1] ?? "1");
}

const isSpecial = (text: string) => text.startsWith("<|");

// The shop sets each entry number; the compositor writes one line per entry, so a small model
// cannot drift into noise or loops across entries. Seeded sampling keeps the run reproducible.
export async function composeSampled(chapter: FabricationChapter, prompt: string, read: Reader, onSort?: (sort: ComposedSort) => void): Promise<ComposedSort[]> {
  const random = seededRandom(chapter.sampling.seed);
  const settings = { temperature: chapter.sampling.temperature, topP: chapter.sampling.topP };
  const sorts: ComposedSort[] = [];
  const used = new Set<number>();
  const push = (sort: ComposedSort) => {
    sorts.push(sort);
    onSort?.(sort);
  };
  let written = "";
  for (let entry = 0; entry < chapter.references; entry++) {
    used.clear();
    if (entry > 0) {
      const marker = `\n${firstEntryNumber(prompt) + entry}.`;
      push({ text: marker, probability: 1, given: true });
      written += marker;
    }
    for (let step = 0; step < chapter.maxTokens; step++) {
      const reading = await read(prompt + written);
      const { candidates, logits } = penalizeRepeats(reading, used, chapter.sampling.repetitionPenalty);
      const chosen = drawCandidate(shapeDistribution(candidates, logits, settings), random);
      if (isSpecial(chosen.text)) break;
      used.add(chosen.tokenId);
      const [line = ""] = chosen.text.split("\n");
      if (line) {
        push({ text: line, probability: tokenProbability(reading.logits, chosen.tokenId).probability });
        written += line;
      }
      if (chosen.text.includes("\n")) break;
    }
  }
  return sorts;
}

// Hugging Face's rule: a used token's logit is divided by the penalty if positive, multiplied if negative.
export function penalizeRepeats(reading: NextTokenResult, used: ReadonlySet<number>, penalty: number) {
  if (penalty === 1 || used.size === 0) return reading;
  const adjust = (id: number, logit: number) => (used.has(id) ? (logit > 0 ? logit / penalty : logit * penalty) : logit);
  const logits = Float32Array.from(reading.logits, (logit, id) => adjust(id, logit));
  const candidates = reading.candidates
    .map((c) => ({ ...c, logit: adjust(c.tokenId, c.logit) }))
    .sort((a, b) => b.logit - a.logit);
  return { ...reading, candidates, logits };
}

// The model continues from the prompt's last number; split its text back into numbered entries.
export function splitReferences(prompt: string, sorts: readonly ComposedSort[], count: number): string[] {
  const firstNumber = firstEntryNumber(prompt);
  const text = `${firstNumber}.${sorts.map((s) => s.text).join("")}`;
  return text
    .split(/\n(?=\d+\.)/)
    .map((entry) => entry.replace(/^\d+\.\s*/, "").trim())
    .filter((entry) => entry.length > 0)
    .slice(0, count);
}
