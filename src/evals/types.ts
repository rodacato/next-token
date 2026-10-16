import { z } from "zod";

const perLocale = z.record(z.string(), z.string().min(1));

export const evalCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  input: perLocale,
  expected: perLocale.optional(),
  mustMention: z.record(z.string(), z.array(z.string())).optional(),
  mustNotMention: z.record(z.string(), z.array(z.string())).optional(),
  tags: z.array(z.string()).default([]),
});

export const graderSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string(), kind: z.literal("exact"), caseInsensitive: z.boolean().default(true) }),
  z.object({ id: z.string(), kind: z.literal("regex"), pattern: z.string(), mustMatch: z.boolean().default(true) }),
  z.object({ id: z.string(), kind: z.literal("max-words"), max: z.number().int().positive() }),
  z.object({
    id: z.string(),
    kind: z.literal("mentions"),
    terms: z.record(z.string(), z.array(z.string()).min(1)),
    mode: z.enum(["all", "none"]),
  }),
  z.object({ id: z.string(), kind: z.literal("case-facts"), check: z.enum(["must-mention", "must-not-mention"]) }),
  z.object({ id: z.string(), kind: z.literal("json-schema"), schemaId: z.string() }),
  z.object({
    id: z.string(),
    kind: z.literal("llm-judge"),
    rubric: perLocale,
    labels: z.object({ input: perLocale, output: perLocale }),
    expects: z.enum(["pass", "expected-answer"]),
    judgeRecipe: z.string(),
  }),
]);

export const evalSetSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  cases: z.array(evalCaseSchema).min(1),
  graders: z.array(graderSchema).min(1),
});

export type EvalCase = z.infer<typeof evalCaseSchema>;
export type Grader = z.infer<typeof graderSchema>;
export type EvalSet = z.infer<typeof evalSetSchema>;

export type Grade = { readonly graderId: string; readonly pass: boolean; readonly note: string };

export type CaseResult = {
  readonly caseId: string;
  readonly output: string;
  readonly grades: readonly Grade[];
  readonly pass: boolean;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
};

export type EvalRun = {
  readonly contenderId: string;
  readonly results: readonly CaseResult[];
  readonly passed: number;
  readonly total: number;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
  readonly sources: readonly string[];
};
