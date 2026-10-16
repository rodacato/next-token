import type { ZodType } from "zod";
import type { EvalCase, Grade, Grader } from "./types";

export type GradeContext = {
  readonly locale: string;
  readonly evalCase: EvalCase;
  readonly output: string;
  readonly schemas: Readonly<Record<string, ZodType>>;
  readonly judge: (rubric: string, evalCase: EvalCase, output: string) => Promise<{ pass: boolean; note: string }>;
};

const normalize = (text: string, caseInsensitive: boolean) => {
  const trimmed = text.trim().replace(/[.!]+$/, "").replace(/\s+/g, " ");
  return caseInsensitive ? trimmed.toLowerCase() : trimmed;
};

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

// Models often wrap JSON in a Markdown fence; the grader reads exactly what came back, fence and all.
export function parseJson(output: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(output) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function grade(grader: Grader, context: GradeContext): Promise<Grade> {
  const { locale, evalCase, output } = context;
  const result = (pass: boolean, note: string): Grade => ({ graderId: grader.id, pass, note });

  switch (grader.kind) {
    case "exact": {
      const expected = evalCase.expected?.[locale];
      if (expected === undefined) return result(false, "no expected answer for this locale");
      const pass = normalize(output, grader.caseInsensitive) === normalize(expected, grader.caseInsensitive);
      return result(pass, pass ? expected : `expected "${expected}"`);
    }
    case "regex": {
      const matches = new RegExp(grader.pattern, "i").test(output);
      return result(matches === grader.mustMatch, matches ? "matches" : "no match");
    }
    case "max-words": {
      const count = words(output);
      return result(count <= grader.max, `${count} words`);
    }
    case "mentions": {
      const terms = grader.terms[locale] ?? [];
      const found = terms.filter((term) => output.toLowerCase().includes(term.toLowerCase()));
      const pass = grader.mode === "all" ? found.length === terms.length : found.length === 0;
      const missing = terms.filter((t) => !found.includes(t));
      return result(pass, grader.mode === "all" ? (pass ? "all present" : `missing: ${missing.join(", ")}`) : pass ? "none present" : `found: ${found.join(", ")}`);
    }
    case "json-schema": {
      const schema = context.schemas[grader.schemaId];
      if (!schema) return result(false, `unknown schema ${grader.schemaId}`);
      const parsed = parseJson(output);
      if (!parsed.ok) return result(false, `not JSON: ${parsed.error}`);
      const validated = schema.safeParse(parsed.value);
      return result(validated.success, validated.success ? "valid" : (validated.error.issues[0]?.message ?? "invalid"));
    }
    case "llm-judge": {
      const verdict = await context.judge(grader.rubric[locale] ?? "", evalCase, output);
      return result(verdict.pass, verdict.note);
    }
  }
}
