import type { TokensChapter } from "../../content/schema";
import type { BenchTokenizer } from "../../model/tokenizers";

export type PairCount = { readonly pairId: string; readonly english: number; readonly spanish: number };
export type TokenizerMeasurement = { readonly tokenizerId: BenchTokenizer["id"]; readonly pairs: readonly PairCount[] };

export async function measurePairs(chapter: TokensChapter, tokenizer: BenchTokenizer): Promise<TokenizerMeasurement> {
  const pairs = await Promise.all(
    chapter.pairs.map(async (pair) => ({
      pairId: pair.id,
      english: (await tokenizer.encode(pair.en)).length,
      spanish: (await tokenizer.encode(pair.es)).length,
    })),
  );
  return { tokenizerId: tokenizer.id, pairs };
}

export function spanishRatio(measurement: TokenizerMeasurement): number {
  const english = measurement.pairs.reduce((sum, p) => sum + p.english, 0);
  const spanish = measurement.pairs.reduce((sum, p) => sum + p.spanish, 0);
  return english === 0 ? 1 : spanish / english;
}

export type Guess = "english" | "spanish" | "same";

// Within 5% counts as "about the same".
export function verdict(ratio: number): Guess {
  if (ratio > 1.05) return "spanish";
  if (ratio < 0.95) return "english";
  return "same";
}

export function monthlyCost(sortsPerConversation: number, conversationsPerDay: number, pricePerMillion: number): number {
  return (sortsPerConversation * conversationsPerDay * 30 * pricePerMillion) / 1_000_000;
}
