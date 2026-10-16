import type { ZodType } from "zod";
import { parseJson } from "./graders.ts";
import { fillTemplate } from "./template.ts";

export type SheetCheck = { readonly ok: true; readonly value: Record<string, unknown> } | { readonly ok: false; readonly error: string };

// The press: a sheet is accepted only if it parses as JSON and the schema accepts it.
export function checkSheet(output: string, schema: ZodType): SheetCheck {
  const trimmed = output.trim();
  const parsed = parseJson(trimmed);
  // Fixed wording, not the engine's parser message, so the same sheet gets the same retry everywhere.
  if (!parsed.ok) return { ok: false, error: trimmed.startsWith("```") ? "not valid JSON: the sheet is wrapped in a Markdown code fence" : "not valid JSON" };
  const validated = schema.safeParse(parsed.value);
  if (!validated.success) {
    const issue = validated.error.issues[0];
    return { ok: false, error: issue ? `${issue.path.join(".") || "sheet"}: ${issue.message}` : "does not match the schema" };
  }
  return { ok: true, value: validated.data as Record<string, unknown> };
}

export function retryPrompt(retryTemplate: string, input: string, error: string, output: string): string {
  return fillTemplate(retryTemplate, input).replaceAll("{{error}}", error).replaceAll("{{output}}", output);
}

export type ExpectedSheet = { readonly orderId: string; readonly refundRequested: boolean; readonly reason: string };

export function sheetMatches(value: Record<string, unknown>, expected: ExpectedSheet): string[] {
  return (Object.keys(expected) as (keyof ExpectedSheet)[]).filter((key) => value[key] !== expected[key]);
}

export type StructuredMode = "asked" | "constrained";

export type SheetRun = {
  readonly caseId: string;
  readonly first: { readonly output: string; readonly check: SheetCheck };
  readonly retry: { readonly output: string; readonly check: SheetCheck } | null;
  readonly wrongFields: readonly string[];
  readonly calls: number;
  readonly tokens: number;
};

export type StructuredTask = {
  readonly system: string;
  readonly template: string;
  readonly retryTemplate: string;
  readonly schema: ZodType;
  readonly jsonSchema: Record<string, unknown>;
  readonly maxTokens: number;
  readonly cases: readonly { readonly id: string; readonly input: string; readonly expected: ExpectedSheet }[];
};

type Complete = (request: { system: string; prompt: string; jsonSchema?: Record<string, unknown>; maxTokens: number }) => Promise<{ text: string; tokens: number }>;

// Feeds every case to the press; asked-nicely sheets that are rejected get exactly one retry.
export async function runPress(task: StructuredTask, mode: StructuredMode, complete: Complete, onSheet?: (run: SheetRun) => void): Promise<SheetRun[]> {
  const runs: SheetRun[] = [];
  for (const c of task.cases) {
    const prompt = fillTemplate(task.template, c.input);
    const first = await complete({ system: task.system, prompt, maxTokens: task.maxTokens, ...(mode === "constrained" ? { jsonSchema: task.jsonSchema } : {}) });
    const firstCheck = checkSheet(first.text, task.schema);
    let retry: SheetRun["retry"] = null;
    let tokens = first.tokens;
    if (!firstCheck.ok && mode === "asked") {
      const second = await complete({ system: task.system, prompt: retryPrompt(task.retryTemplate, c.input, firstCheck.error, first.text), maxTokens: task.maxTokens });
      retry = { output: second.text, check: checkSheet(second.text, task.schema) };
      tokens += second.tokens;
    }
    const final = retry?.check ?? firstCheck;
    const run: SheetRun = {
      caseId: c.id,
      first: { output: first.text, check: firstCheck },
      retry,
      wrongFields: final.ok ? sheetMatches(final.value, c.expected) : [],
      calls: retry ? 2 : 1,
      tokens,
    };
    runs.push(run);
    onSheet?.(run);
  }
  return runs;
}
