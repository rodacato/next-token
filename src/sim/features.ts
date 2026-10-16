import { rng, seedFor } from "./rng.ts";

export type Approach = "rules" | "search" | "llm";
export const approaches: readonly Approach[] = ["rules", "search", "llm"];

export type ApproachSpec = {
  readonly coverage: number;
  readonly accuracy: number;
  readonly apiUsdPerRequest: number;
  readonly latencyMs: number;
};

export type FeatureSpec = {
  readonly id: string;
  readonly weeklyRequests: number;
  readonly wrongCostMxn: number;
  readonly personMinutes: number;
  readonly approaches: Readonly<Record<Approach, ApproachSpec>>;
};

export type Economics = { readonly mxnPerUsd: number; readonly personMxnPerHour: number; readonly weeks: number; readonly seed: number };

export type Outcome = {
  readonly right: number;
  readonly wrong: number;
  readonly toPerson: number;
  readonly apiMxn: number;
  readonly personMxn: number;
  readonly wrongMxn: number;
  readonly totalMxn: number;
  readonly latencyMs: number;
};

// Each request gets the same two draws whatever the approach, so approaches differ only by their numbers.
export function simulateFeature(feature: FeatureSpec, approach: Approach, economics: Economics): Outcome {
  const spec = feature.approaches[approach];
  const requests = feature.weeklyRequests * economics.weeks;
  let right = 0;
  let wrong = 0;
  let toPerson = 0;
  for (let i = 0; i < requests; i++) {
    const r = rng(seedFor(economics.seed, feature.id, i));
    const covered = r.chance(spec.coverage);
    if (!covered) toPerson++;
    else if (r.chance(spec.accuracy)) right++;
    else wrong++;
  }
  const apiMxn = requests * spec.apiUsdPerRequest * economics.mxnPerUsd;
  const personMxn = (toPerson * feature.personMinutes * economics.personMxnPerHour) / 60;
  const wrongMxn = wrong * feature.wrongCostMxn;
  return { right, wrong, toPerson, apiMxn, personMxn, wrongMxn, totalMxn: apiMxn + personMxn + wrongMxn, latencyMs: spec.latencyMs };
}

export type Plan = Readonly<Record<string, Approach>>;

// Costs add up feature by feature, so the cheapest of the 81 plans takes the cheapest approach for each.
export function cheapestPlan(features: readonly FeatureSpec[], economics: Economics): { plan: Plan; totalMxn: number } {
  const best: Record<string, Approach> = {};
  let total = 0;
  for (const feature of features) {
    const ranked = approaches.map((a) => ({ a, cost: simulateFeature(feature, a, economics).totalMxn })).sort((x, y) => x.cost - y.cost);
    const first = ranked[0];
    if (!first) continue;
    best[feature.id] = first.a;
    total += first.cost;
  }
  return { plan: best, totalMxn: total };
}
