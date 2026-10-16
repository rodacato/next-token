import { z } from "zod";
import { composedSortSchema, needleResultSchema } from "./experiments.ts";

const runMeta = {
  model: z.string(),
  repo: z.string(),
  dtype: z.string(),
  device: z.enum(["webgpu", "wasm"]),
  recordedAt: z.iso.date(),
  locale: z.string(),
};

export const needleRecordingSchema = z.object({ ...runMeta, answer: z.string(), results: z.array(needleResultSchema).min(3) });

export const referenceCheckSchema = z.object({
  text: z.string(),
  verdict: z.enum(["found", "not-found"]),
  checkedAt: z.iso.date(),
  checkedWith: z.literal("semantic-scholar-title-match"),
  matchedTitle: z.string().optional(),
  matchedUrl: z.url().optional(),
  lookup: z.literal("no-title").optional(),
});

export const compositionRecordingSchema = z.object({
  ...runMeta,
  prompt: z.string(),
  sampling: z.object({ temperature: z.number(), topP: z.number(), seed: z.number().int(), repetitionPenalty: z.number() }),
  sorts: z.array(composedSortSchema).min(1),
  references: z.array(referenceCheckSchema),
});

export type NeedleRecording = z.infer<typeof needleRecordingSchema>;
export type CompositionRecording = z.infer<typeof compositionRecordingSchema>;
export type ReferenceCheck = z.infer<typeof referenceCheckSchema>;
