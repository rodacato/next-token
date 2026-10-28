export type Candidate = {
  readonly tokenId: number;
  readonly text: string;
  readonly logit: number;
};

export type ShapedCandidate = Candidate & {
  readonly probability: number;
  readonly inNucleus: boolean;
  readonly rank: number;
};

export type ShapedDistribution = {
  readonly candidates: readonly ShapedCandidate[];
  readonly tailMass: number;
  readonly entropyBits: number;
  readonly temperature: number;
  readonly topP: number;
};

export type SamplingSettings = { readonly temperature: number; readonly topP: number };

// Temperature 0 means greedy; clamping avoids dividing by zero.
export const MIN_TEMPERATURE = 0.01;

// Candidates arrive sorted by logit; allLogits covers the whole vocabulary so tail mass is exact.
export function shapeDistribution(
  candidates: readonly Candidate[],
  allLogits: ArrayLike<number>,
  { temperature, topP }: SamplingSettings,
): ShapedDistribution {
  const t = Math.max(temperature, MIN_TEMPERATURE);
  const maxLogit = maxOf(allLogits);
  const weightOf = (logit: number) => Math.exp((logit - maxLogit) / t);

  let normalizer = 0;
  for (let i = 0; i < allLogits.length; i++) normalizer += weightOf(allLogits[i] ?? -Infinity);

  let entropyBits = 0;
  for (let i = 0; i < allLogits.length; i++) {
    const p = weightOf(allLogits[i] ?? -Infinity) / normalizer;
    if (p > 0) entropyBits -= p * Math.log2(p);
  }

  let massBefore = 0;
  const shaped = candidates.map((candidate, rank): ShapedCandidate => {
    const probability = weightOf(candidate.logit) / normalizer;
    const inNucleus = massBefore < topP;
    massBefore += probability;
    return { ...candidate, probability, inNucleus, rank };
  });

  const shownMass = shaped.reduce((sum, c) => sum + c.probability, 0);
  return { candidates: shaped, tailMass: Math.max(0, 1 - shownMass), entropyBits, temperature: t, topP };
}

function maxOf(values: ArrayLike<number>): number {
  let max = -Infinity;
  for (let i = 0; i < values.length; i++) max = Math.max(max, values[i] ?? -Infinity);
  return max;
}

export function perplexity(distribution: ShapedDistribution): number {
  return 2 ** distribution.entropyBits;
}

export function fanOpenness(distribution: ShapedDistribution, fanSize: number): number {
  if (fanSize <= 1) return 0;
  return Math.min(1, Math.max(0, (perplexity(distribution) - 1) / (fanSize - 1)));
}

export type RandomSource = () => number;

// Mulberry32: tiny and seedable, so recorded demos replay the same draws.
export function seededRandom(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let r = Math.imul(state ^ (state >>> 15), 1 | state);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export const OUTSIDE = "outside";
export type Draw = ShapedCandidate | typeof OUTSIDE;

// Draws over the whole vocabulary: when the nucleus reaches past the shortlist, its tail share can be drawn too,
// and comes back as OUTSIDE because the shortlist doesn't know which sort it was.
export function drawSort(distribution: ShapedDistribution, random: RandomSource): Draw {
  if (distribution.temperature <= MIN_TEMPERATURE) return greedyCandidate(distribution);
  const nucleus = distribution.candidates.filter((c) => c.inNucleus);
  const shownMass = nucleus.reduce((sum, c) => sum + c.probability, 0);
  const listedMass = distribution.candidates.reduce((sum, c) => sum + c.probability, 0);
  const tailInNucleus = nucleus.length === distribution.candidates.length ? Math.min(distribution.tailMass, Math.max(0, distribution.topP - listedMass)) : 0;
  if (random() * (shownMass + tailInNucleus) >= shownMass) return OUTSIDE;
  return drawCandidate(distribution, random);
}

// Draws among the shortlist only, renormalized; drawSort is the faithful version.
export function drawCandidate(distribution: ShapedDistribution, random: RandomSource): ShapedCandidate {
  if (distribution.temperature <= MIN_TEMPERATURE) return greedyCandidate(distribution);
  const nucleus = distribution.candidates.filter((c) => c.inNucleus);
  const first = nucleus[0];
  if (!first) throw new Error("Cannot draw from an empty distribution.");
  const mass = nucleus.reduce((sum, c) => sum + c.probability, 0);
  let remaining = random() * mass;
  for (const candidate of nucleus) {
    remaining -= candidate.probability;
    if (remaining <= 0) return candidate;
  }
  return nucleus[nucleus.length - 1] ?? first;
}

export function greedyCandidate(distribution: ShapedDistribution): ShapedCandidate {
  const first = distribution.candidates[0];
  if (!first) throw new Error("Cannot pick from an empty distribution.");
  return first;
}

export type DrawTally = { readonly text: string; readonly count: number };

export type Tally = { readonly sorts: DrawTally[]; readonly outside: number };

export function tallyDraws(distribution: ShapedDistribution, draws: number, random: RandomSource): Tally {
  const counts = new Map<string, number>();
  let outside = 0;
  for (let i = 0; i < draws; i++) {
    const drawn = drawSort(distribution, random);
    if (drawn === OUTSIDE) outside++;
    else counts.set(drawn.text, (counts.get(drawn.text) ?? 0) + 1);
  }
  return { sorts: [...counts.entries()].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count), outside };
}
