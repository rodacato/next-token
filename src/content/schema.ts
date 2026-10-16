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

const localeMap = z.record(z.string(), z.string());

export const loraChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("lora"),
  base: z.object({ corpus: localeMap, steps: z.number().int().positive() }),
  adapter: z.object({ corpus: localeMap, ranks: z.array(z.number().int().positive()).min(1), alphaPerRank: z.number().positive(), steps: z.number().int().positive(), learningRate: z.number().positive() }),
  every: z.number().int().positive(),
  sampleEvery: z.number().int().positive(),
  temperature: z.number().positive(),
  sampleCount: z.number().int().positive(),
  sampleSeed: z.number().int(),
  real: z.object({
    name: z.string(),
    checkedAt: z.iso.date(),
    hiddenSize: z.number().int(),
    layers: z.number().int(),
    heads: z.number().int(),
    kvHeads: z.number().int(),
    headDim: z.number().int(),
    intermediateSize: z.number().int(),
    vocabSize: z.number().int(),
    tiedEmbeddings: z.boolean(),
  }),
});

export const stagesChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("stages"),
  model: z.string(),
  stages: z.array(z.object({ id: z.string(), repo: z.string() })).min(2),
  maxTokens: z.number().int().positive(),
  prompts: z.array(z.object({ id: z.string(), text: perLocale, check: perLocale.optional() })).min(1),
});

export const datasetSchema = z.object({
  id: z.string(),
  note: z.string(),
  style: perLocale,
  rows: z
    .array(
      z.object({
        id: z.string(),
        locale: z.string(),
        planted: z.enum(["keep", "exact-duplicate", "near-duplicate", "contradiction", "bad-answer", "eval-leak"]),
        customer: z.string().min(1),
        reply: z.string().min(1),
      }),
    )
    .min(1),
});

export const datasetChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("dataset"),
  datasetId: z.string(),
  evalSets: z.array(z.string()),
  policy: perLocale,
  judge: z.object({ system: perLocale, template: perLocale }),
});

export const ledgerChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("ledger"),
  methods: z.array(z.object({ id: z.string(), source: z.string(), data: perLocale, changes: perLocale, cannot: perLocale })).min(2),
  pipeline: z.array(z.object({ stage: z.string(), methods: z.array(z.string()).min(1) })),
  jobs: z.array(z.object({ id: z.string(), answer: z.string(), text: perLocale })).min(1),
});

export const decisionChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("decision"),
  options: z.array(z.string()).min(2),
  evidenceSet: z.string(),
  exampleCase: z.string(),
  cases: z.array(z.object({ id: z.string(), answer: z.string(), text: perLocale, why: perLocale })).min(1),
});

export const beforeAfterChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("before-after"),
  evalSets: z.array(z.string()).min(1),
  regressionSet: z.string(),
});

const approachSchema = z.object({
  coverage: z.number().min(0).max(1),
  accuracy: z.number().min(0).max(1),
  latencyMs: z.number().nonnegative(),
  tokens: z.object({ model: z.string(), input: z.number().int().nonnegative(), output: z.number().int().nonnegative() }).optional(),
  why: perLocale,
  evidence: z.string(),
});

export const featuresChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("commission-features"),
  economics: z.object({ mxnPerUsd: z.number().positive(), personMxnPerHour: z.number().positive(), weeks: z.number().int().positive(), seed: z.number().int() }),
  features: z
    .array(
      z.object({
        id: z.string(),
        weeklyRequests: z.number().int().positive(),
        wrongCostMxn: z.number().nonnegative(),
        personMinutes: z.number().nonnegative(),
        text: perLocale,
        approaches: z.object({ rules: approachSchema, search: approachSchema, llm: approachSchema }),
      }),
    )
    .min(1),
});

const range = z.tuple([z.number(), z.number()]);

export const failureChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("commission-failure"),
  model: z.object({
    conversations: z.number().int().positive(),
    seed: z.number().int(),
    right: z.number().min(0).max(1),
    wrong: z.number().min(0).max(1),
    actionShare: z.number().min(0).max(1),
    replySeconds: range,
    firstTokenSeconds: z.number().positive(),
    patienceSeconds: range,
    guessRight: z.number().min(0).max(1),
    flaggedWrong: z.number().min(0).max(1),
    checkedWhenFlagged: z.number().min(0).max(1),
    noticedForUndo: z.number().min(0).max(1),
    caughtAtConfirm: z.number().min(0).max(1),
  }),
  assumptions: z.array(z.object({ key: z.string(), evidence: z.string() })),
  sample: z.object({ customer: perLocale, reply: perLocale, refusal: perLocale }),
});

export const billChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("commission-bill"),
  cheap: z.string(),
  strong: z.string(),
  traffic: z.object({
    conversationsPerDay: z.number().nonnegative(),
    turnsPerConversation: z.number().int().positive(),
    systemTokens: z.number().nonnegative(),
    contextTokens: z.number().nonnegative(),
    userTokens: z.number().nonnegative(),
    outputTokens: z.number().nonnegative(),
  }),
  routing: z.object({ strongShare: z.number().min(0).max(1), caching: z.boolean(), cacheHitRate: z.number().min(0).max(1) }),
  hardShare: z.number().min(0).max(1),
  budgetUsdPerMonth: z.number().positive(),
  daysPerMonth: z.number().int().positive(),
  mxnPerUsd: z.number().positive(),
  latency: z.record(z.string(), z.object({ firstTokenMs: z.number().nonnegative(), tokensPerSecond: z.number().positive() })),
  brackets: z.array(z.number().positive()).min(1),
});

export const launchChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("commission-launch"),
  billChapter: z.string(),
  goalMxn: z.number().positive(),
  world: z.object({
    weeks: z.number().int().positive(),
    stagedShare: z.array(z.number().min(0).max(1)),
    trafficMultiplier: z.array(z.number().positive()),
    dailyCapUsd: z.number().positive(),
    mxnPerUsd: z.number().positive(),
    checkUsdPerConversation: z.number().nonnegative(),
    invented: z.object({ ungrounded: z.number(), grounded: z.number(), caughtByCheck: z.number(), honoredShare: z.number(), costMxn: z.number() }),
    injection: z.object({ week: z.number().int().positive(), attemptsPerAttack: z.number().int().nonnegative(), baseSuccess: z.number().min(0).max(1), costMxn: z.record(z.string(), z.number()) }),
  }),
  defaultPlan: z.object({ staged: z.boolean(), budgetCap: z.boolean(), optimized: z.boolean(), grounding: z.boolean(), outputCheck: z.boolean(), defenses: z.array(z.string()) }),
  defenses: z.array(z.object({ id: z.string(), text: perLocale })).min(1),
  attacks: z
    .array(
      z.object({
        id: z.string(),
        vector: z.enum(["customer", "review", "tool-result"]),
        goal: z.string(),
        text: perLocale,
        effects: z.record(z.string(), z.enum(["blocks", "weakens", "none"])),
      }),
    )
    .min(1),
});

const keywordSet = z.object({ source: z.array(z.string()), unsure: z.array(z.string()), format: z.array(z.string()), compensation: z.array(z.string()), limit: z.array(z.string()) });

export const finaleChapterSchema = z.object({
  ...chapterBase,
  kind: z.literal("finale"),
  members: z.array(z.enum(["product", "support", "security", "finance"])).min(1),
  graders: z.array(z.string()).min(1),
  guardrails: z.array(z.string()).min(1),
  keywords: z.record(z.string(), keywordSet),
});

export const chapterSchema = z.discriminatedUnion("kind", [
  finaleChapterSchema,
  launchChapterSchema,
  billChapterSchema,
  failureChapterSchema,
  featuresChapterSchema,
  decisionChapterSchema,
  beforeAfterChapterSchema,
  ledgerChapterSchema,
  datasetChapterSchema,
  stagesChapterSchema,
  loraChapterSchema,
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
export type LoraChapter = z.infer<typeof loraChapterSchema>;
export type StagesChapter = z.infer<typeof stagesChapterSchema>;
export type DatasetChapter = z.infer<typeof datasetChapterSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
export type LedgerChapter = z.infer<typeof ledgerChapterSchema>;
export type DecisionChapter = z.infer<typeof decisionChapterSchema>;
export type BeforeAfterChapter = z.infer<typeof beforeAfterChapterSchema>;
export type FeaturesChapter = z.infer<typeof featuresChapterSchema>;
export type FailureChapter = z.infer<typeof failureChapterSchema>;
export type BillChapter = z.infer<typeof billChapterSchema>;
export type LaunchChapter = z.infer<typeof launchChapterSchema>;
export type FinaleChapter = z.infer<typeof finaleChapterSchema>;
