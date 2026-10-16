import { mulberry32 } from "./random.ts";

// Lines go to train or validation whole, so a validation proverb is never seen in training.
export function splitCorpus(lines: readonly string[], valShare: number, seed: number) {
  const rand = mulberry32(seed);
  const train: string[] = [];
  const val: string[] = [];
  for (const line of lines) (rand() < valShare ? val : train).push(line);
  return { train, val };
}

export function vocabularyOf(lines: readonly string[]): string {
  return [...new Set(["\n", ...lines.join("")])].sort().join("");
}

