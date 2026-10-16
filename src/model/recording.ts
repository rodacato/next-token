import { z } from "zod";
import type { NextTokenResult } from "./client";
import type { Candidate } from "./sampling";

const candidateSchema = z.object({ tokenId: z.number().int(), text: z.string(), logit: z.number() });

// The tail beyond the shortlist is kept as a histogram: enough to normalize at any temperature.
const tailSchema = z.object({ min: z.number(), binWidth: z.number().positive(), counts: z.array(z.number().int().nonnegative()) });

export const recordedStepSchema = z.object({
  context: z.string(),
  pieces: z.array(z.object({ tokenId: z.number().int(), text: z.string() })).min(1),
  elapsedMs: z.number().nonnegative(),
  candidates: z.array(candidateSchema).min(1),
  tail: tailSchema,
});

export const recordedRunSchema = z.object({
  model: z.string(),
  repo: z.string(),
  dtype: z.string(),
  device: z.enum(["webgpu", "wasm"]),
  recordedAt: z.iso.date(),
  locale: z.string(),
  vocabularySize: z.number().int().positive(),
  steps: z.array(recordedStepSchema).min(1),
});

export type RecordedStep = z.infer<typeof recordedStepSchema>;
export type RecordedRun = z.infer<typeof recordedRunSchema>;

const TAIL_BINS = 160;

export function recordStep(context: string, result: NextTokenResult): RecordedStep {
  const shortlisted = new Set(result.candidates.map((c) => c.tokenId));
  let min = Infinity;
  let max = -Infinity;
  result.logits.forEach((logit, id) => {
    if (shortlisted.has(id)) return;
    min = Math.min(min, logit);
    max = Math.max(max, logit);
  });
  const binWidth = Math.max((max - min) / TAIL_BINS, 1e-6);
  const counts = new Array<number>(TAIL_BINS).fill(0);
  result.logits.forEach((logit, id) => {
    if (shortlisted.has(id)) return;
    const bin = Math.min(TAIL_BINS - 1, Math.floor((logit - min) / binWidth));
    counts[bin] = (counts[bin] ?? 0) + 1;
  });
  return {
    context,
    pieces: [...result.pieces],
    elapsedMs: Math.round(result.elapsedMs),
    candidates: result.candidates.map((c) => ({ ...c, logit: round(c.logit) })),
    tail: { min: round(min), binWidth: round(binWidth, 5), counts },
  };
}

export function replayStep(step: RecordedStep): NextTokenResult {
  const tailSize = step.tail.counts.reduce((sum, n) => sum + n, 0);
  const logits = new Float32Array(step.candidates.length + tailSize);
  step.candidates.forEach((c: Candidate, i) => (logits[i] = c.logit));
  let cursor = step.candidates.length;
  step.tail.counts.forEach((count, bin) => {
    const center = step.tail.min + (bin + 0.5) * step.tail.binWidth;
    logits.fill(center, cursor, cursor + count);
    cursor += count;
  });
  return { candidates: step.candidates, logits, pieces: step.pieces, elapsedMs: step.elapsedMs };
}

const round = (value: number, digits = 3) => Number(value.toFixed(digits));
