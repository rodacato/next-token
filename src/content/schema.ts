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

const perLocale = z.record(z.string(), z.string().min(1));

export const duelSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  evalSetId: z.string(),
  maxTokens: z.number().int().positive(),
  contenders: z
    .array(z.object({ id: z.string(), looksBetter: z.boolean(), system: perLocale, template: perLocale }))
    .length(2),
});

const turnSchema = z.object({
  role: z.enum(["system", "customer", "assistant"]),
  text: z.string().min(1),
  fact: z.string().optional(),
});

export const stickChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("stick"),
  capacity: z.number().int().positive(),
  conversation: z.record(z.string(), z.array(turnSchema).min(2)),
  summary: perLocale,
  needle: z.object({
    positions: z.number().int().min(3),
    fact: perLocale,
    question: perLocale,
    answer: z.string().min(1),
    haystack: z.record(z.string(), z.array(z.string().min(1)).min(8)),
  }),
});

export const fabricationChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("fabrication"),
  referencePrompt: perLocale,
  maxTokens: z.number().int().positive(),
  references: z.number().int().positive(),
  sampling: z.object({ temperature: z.number().positive(), topP: z.number().positive().max(1), seed: z.number().int(), repetitionPenalty: z.number().min(1) }),
  contrastRecipe: z.string(),
});

export const duelChapterSchema = z.object({ ...chapterBase, kind: z.literal("duel"), duelId: z.string() });

export const evalBuilderChapterSchema = z.object({ ...chapterBase, kind: z.literal("eval-builder"), duelId: z.string(), minCases: z.number().int().positive() });

export const structuredChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("structured"),
  schemaId: z.string(),
  maxTokens: z.number().int().positive(),
  system: perLocale,
  template: perLocale,
  retry: perLocale,
  cases: z
    .array(z.object({ id: z.string(), input: perLocale, expected: z.object({ orderId: z.string(), refundRequested: z.boolean(), reason: z.string() }) }))
    .min(1),
});

const resultChoiceSchema = z.object({ id: z.string().regex(/^[a-z0-9-]+$/), result: z.record(z.string(), z.unknown()), echoInput: z.boolean().optional() });

export const toolsChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("tools"),
  maxTokens: z.number().int().positive(),
  maxSteps: z.number().int().positive(),
  system: perLocale,
  customer: perLocale,
  labels: z.record(z.string(), z.object({ customer: z.string(), call: z.string(), result: z.string() })),
  toolResults: z.object({ lookup_order: z.array(resultChoiceSchema).min(1), issue_refund: z.array(resultChoiceSchema).min(1) }),
});

export const ragChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("rag"),
  embedder: z.literal("multilingual-e5-small"),
  fixedSize: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
  handbook: perLocale,
  questions: z.array(z.object({ id: z.string().regex(/^[a-z0-9-]+$/), short: perLocale, text: perLocale, answerKey: perLocale })).min(1),
  system: perLocale,
  template: perLocale,
  noExcerpts: perLocale,
  judge: z.object({ system: perLocale, template: perLocale }),
});

const labelsSchema = z.object({ customer: z.string(), call: z.string(), result: z.string(), notes: z.string() });

export const agentsChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("agents"),
  maxTokens: z.number().int().positive(),
  refundThreshold: z.number().positive(),
  stepOptions: z.array(z.number().int().positive()).min(1),
  orders: z.array(z.object({ orderId: z.string(), items: z.string(), totalMxn: z.number(), daysSinceDelivery: z.number().int(), status: z.string() })).min(1),
  tickets: z.array(z.object({ id: z.string(), message: perLocale })).min(1),
  system: perLocale,
  subagent: perLocale,
  labels: z.record(z.string(), labelsSchema),
  notes: z.object({ refunded: perLocale, none: perLocale }),
  harnessResults: z.object({ blocked: perLocale, declined: perLocale }),
});

export const corpusSchema = z.object({ id: z.string().regex(/^[a-z0-9-]+$/), locale: z.string(), note: z.string(), lines: z.array(z.string().min(1)).min(20) });

export const trainerChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("trainer"),
  corpus: z.record(z.string(), z.string()),
  config: z.object({
    shape: z.object({ block: z.number().int().positive(), dim: z.number().int().positive(), heads: z.number().int().positive(), layers: z.number().int().positive() }),
    batch: z.number().int().positive(),
    learningRate: z.number().positive(),
    seed: z.number().int(),
    valShare: z.number().min(0).max(0.5),
  }),
  steps: z.number().int().positive(),
  every: z.number().int().positive(),
  sampleEvery: z.number().int().positive(),
  temperature: z.number().positive(),
  stops: z.array(z.number().int().positive()).min(1),
  sampleCount: z.number().int().positive(),
  sampleSeed: z.number().int(),
});

export const chapterSchema = z.discriminatedUnion("kind", [
  trainerChapterSchema,
  agentsChapterSchema,
  ragChapterSchema,
  toolsChapterSchema,
  structuredChapterSchema,
  tokensChapterSchema,
  nextTokenChapterSchema,
  stickChapterSchema,
  fabricationChapterSchema,
  duelChapterSchema,
  evalBuilderChapterSchema,
]);

export type Source = z.infer<typeof sourceSchema>;
export type Chapter = z.infer<typeof chapterSchema>;
export type TokensChapter = z.infer<typeof tokensChapterSchema>;
export type NextTokenChapter = z.infer<typeof nextTokenChapterSchema>;
export type StickChapter = z.infer<typeof stickChapterSchema>;
export type FabricationChapter = z.infer<typeof fabricationChapterSchema>;
export type ConversationTurn = z.infer<typeof turnSchema>;
export type Duel = z.infer<typeof duelSchema>;
export type DuelChapter = z.infer<typeof duelChapterSchema>;
export type StructuredChapter = z.infer<typeof structuredChapterSchema>;
export type EvalBuilderChapter = z.infer<typeof evalBuilderChapterSchema>;
export type ToolsChapter = z.infer<typeof toolsChapterSchema>;
export type RagChapter = z.infer<typeof ragChapterSchema>;
export type AgentsChapter = z.infer<typeof agentsChapterSchema>;
export type TrainerChapter = z.infer<typeof trainerChapterSchema>;
export type Corpus = z.infer<typeof corpusSchema>;
