import type { ComposedSort } from "../../model/experiments";

// Average probability of the sorts that make up each numbered entry the model wrote.
export function referenceConfidence(sorts: readonly ComposedSort[], count: number): number[] {
  const totals = Array.from({ length: count }, () => ({ sum: 0, n: 0 }));
  let written = "";
  for (const sort of sorts) {
    written += sort.text;
    const starts = written.match(/\n\d+\./g)?.length ?? 0;
    const entry = Math.min(count, starts);
    if (entry >= count) break;
    const bucket = totals[entry];
    if (bucket && !sort.given && sort.text.trim().length > 0) {
      bucket.sum += sort.probability;
      bucket.n += 1;
    }
  }
  return totals.map(({ sum, n }) => (n === 0 ? 0 : sum / n));
}
