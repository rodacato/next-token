import { z } from "zod";

export const sourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  authors: z.string(),
  title: z.string(),
  year: z.number().int(),
  url: z.url(),
  kind: z.enum(["paper", "video", "docs", "code", "book"]),
});

export const bilingualPairSchema = z.object({
  id: z.string(),
  en: z.string().min(1),
  es: z.string().min(1),
});

const chapterBase = {
  id: z.string().regex(/^[a-z0-9-]+$/),
  act: z.enum(["compositor", "craft", "foundry", "commissions"]),
  number: z.number().int().positive(),
  readNext: z.array(z.string()).min(1),
};

export const tokensChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("tokens"),
  pairs: z.array(bilingualPairSchema).min(1),
  defaultPricePerMillion: z.number().positive(),
  defaultConversationsPerDay: z.number().int().positive(),
  sortsPerConversation: z.number().int().positive(),
});

export const nextTokenChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("next-token"),
  defaultCopy: z.record(z.string(), z.string().min(1)),
  measurement: z.object({
    draws: z.number().int().positive(),
    coldTemperature: z.number().min(0),
    hotTemperature: z.number().positive(),
    seed: z.number().int(),
  }),
});

export const chapterSchema = z.discriminatedUnion("kind", [tokensChapterSchema, nextTokenChapterSchema]);

export type Source = z.infer<typeof sourceSchema>;
export type Chapter = z.infer<typeof chapterSchema>;
export type TokensChapter = z.infer<typeof tokensChapterSchema>;
export type NextTokenChapter = z.infer<typeof nextTokenChapterSchema>;
