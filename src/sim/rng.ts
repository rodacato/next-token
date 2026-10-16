import { mulberry32 } from "../trainer/random.ts";

export { mulberry32 };

// Every simulation draws from one seeded stream, so a replay with the same choices is the same week.
export type Rng = { next(): number; chance(p: number): boolean; between(lo: number, hi: number): number };

export function rng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    chance: (p) => next() < p,
    between: (lo, hi) => lo + (hi - lo) * next(),
  };
}

// The same seed for the same day and stream, whatever the learner toggled before.
export function seedFor(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join("|")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}
