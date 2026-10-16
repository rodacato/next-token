// Placeholder distribution for the Step 0 boards. These are illustrative
// numbers shaped like a small model's output, NOT a model run. Step 1 replaces
// them with real logits from the in-browser model.

export const context = ["Every", " morning", " the", " baker", " opens", " the"];

// Probabilities at T = 1. Logits are recovered as ln(p), which is exact up to
// an additive constant, and softmax does not care about that constant.
const baseCandidates = [
  { token: " door", p: 0.281 },
  { token: " shop", p: 0.192 },
  { token: " oven", p: 0.138 },
  { token: " doors", p: 0.071 },
  { token: " window", p: 0.059 },
  { token: " bakery", p: 0.048 },
  { token: " shutters", p: 0.037 },
  { token: " store", p: 0.033 },
  { token: " front", p: 0.027 },
  { token: " gates", p: 0.019 },
  { token: " till", p: 0.014 },
  { token: " curtains", p: 0.01 },
];

export const vocabularySize = 49152;

export function tokenFace(token) {
  return token.startsWith(" ") ? "·" + token.slice(1) : token;
}

export function distribution(temperature, topP = 1) {
  const t = Math.max(temperature, 0.05);
  const logits = baseCandidates.map((c) => Math.log(c.p) / t);
  const max = Math.max(...logits);
  const weights = logits.map((l) => Math.exp(l - max));
  // The tail of the vocabulary, folded into one bucket, also sharpens with T.
  const tailMass = 1 - baseCandidates.reduce((s, c) => s + c.p, 0);
  const tailWeight = Math.exp(Math.log(tailMass) / t - max);
  const total = weights.reduce((s, w) => s + w, 0) + tailWeight;

  let cumulative = 0;
  const candidates = baseCandidates.map((c, i) => {
    const p = weights[i] / total;
    const inNucleus = cumulative < topP;
    cumulative += p;
    return { token: c.token, face: tokenFace(c.token), logit: Math.log(c.p), p, inNucleus };
  });
  const entropy = -candidates.reduce((s, c) => s + (c.p > 0 ? c.p * Math.log2(c.p) : 0), 0);
  return { candidates, tail: tailWeight / total, entropy };
}

// Normalized "openness" of the fan in [0, 1], from perplexity: how many sorts
// the compositor is effectively choosing between, out of those on the fan.
export function openness(entropy, shown = 8) {
  return Math.min(1, Math.max(0, (2 ** entropy - 1) / (shown - 1)));
}

export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function sample(candidates, random) {
  const pool = candidates.filter((c) => c.inNucleus);
  const mass = pool.reduce((s, c) => s + c.p, 0);
  let x = random() * mass;
  for (const c of pool) {
    x -= c.p;
    if (x <= 0) return c;
  }
  return pool[pool.length - 1];
}
