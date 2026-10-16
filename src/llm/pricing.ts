import { z } from "zod";
import raw from "../content/prices.json";

const priceTableSchema = z.object({
  asOf: z.iso.date(),
  source: z.string(),
  note: z.string(),
  cacheCheckedAt: z.iso.date(),
  cacheNote: z.string(),
  models: z.array(
    z.object({
      provider: z.string(),
      model: z.string(),
      label: z.string(),
      inputPerMTok: z.number().nonnegative(),
      outputPerMTok: z.number().nonnegative(),
      cacheWritePerMTok: z.number().nonnegative(),
      cacheReadPerMTok: z.number().nonnegative(),
    }),
  ),
});

export const priceTable = priceTableSchema.parse(raw);

export type Price = { readonly inputPerMTok: number; readonly outputPerMTok: number };

export function listedPrice(model: string): Price | null {
  return priceTable.models.find((m) => m.model === model) ?? null;
}

export function costUsd(price: Price, inputTokens: number, outputTokens: number): number {
  return (inputTokens * price.inputPerMTok + outputTokens * price.outputPerMTok) / 1_000_000;
}

// Without the provider's own counter, about four characters per token is the usual rough guide.
export function roughTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
