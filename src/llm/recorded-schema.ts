import { z } from "zod";

// A recipe says what to ask; a recording is what a real model answered, with model, date and usage.
export const recipeRequestSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  locale: z.string(),
  system: z.string(),
  prompt: z.string().min(1),
  jsonSchema: z.record(z.string(), z.unknown()).optional(),
});

export const recipeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  purpose: z.string(),
  model: z.string(),
  repeats: z.number().int().positive().default(1),
  requests: z.array(recipeRequestSchema).min(1),
});

export const recordedCompletionSchema = z.object({
  requestId: z.string(),
  locale: z.string(),
  attempt: z.number().int().positive(),
  model: z.string(),
  system: z.string(),
  prompt: z.string(),
  output: z.string(),
  structured: z.unknown().optional(),
  usage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheCreationTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
  }),
  listCostUsd: z.number().nonnegative(),
  durationMs: z.number().nonnegative(),
});

export const recordedSetSchema = z.object({
  recipeId: z.string(),
  recordedAt: z.iso.date(),
  via: z.literal("claude-code-cli"),
  temperature: z.literal("provider-default"),
  completions: z.array(recordedCompletionSchema).min(1),
});

export type Recipe = z.infer<typeof recipeSchema>;
export type RecipeRequest = z.infer<typeof recipeRequestSchema>;
export type RecordedCompletion = z.infer<typeof recordedCompletionSchema>;
export type RecordedSet = z.infer<typeof recordedSetSchema>;
