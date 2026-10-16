import type { ZodType } from "zod";
import type { EvalCase, Grade, Grader } from "./types";

export type GradeContext = {
  readonly locale: string;
  readonly evalCase: EvalCase;
  readonly output: string;
  readonly schemas: Readonly<Record<string, ZodType>>;
  readonly judge: (grader: Extract<Grader, { kind: "llm-judge" }>, evalCase: EvalCase, output: string) => Promise<{ pass: boolean; note: string }>;
};

const normalize = (text: string, caseInsensitive: boolean) => {
  const trimmed = text.trim().replace(/[.!]+$/, "").replace(/\s+/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

// "Not microwave safe" repeats the spec; it is not a claim that the mug is microwave safe.
export function claims(output: string, term: string): boolean {
  const text = output.toLowerCase();
  const needle = term.toLowerCase();
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    const before = text.slice(Math.max(0, at - 12), at);
    if (!/\b(not|no|non|sin|ni)\b[\s-]*\S*\s*$/.test(before)) return true;
  }
  return false;
}

export function readOneWordVerdict(output: string): "yes" | "no" | null {
  const word = normalize(output, true);
  if (word === "yes" || word === "si") return "yes";
  if (word === "no") return "no";
  return null;
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
    case "case-facts": {
      const terms = (grader.check === "must-mention" ? evalCase.mustMention : evalCase.mustNotMention)?.[locale] ?? [];
      const found = terms.filter((term) => (grader.check === "must-mention" ? output.toLowerCase().includes(term.toLowerCase()) : claims(output, term)));
      if (grader.check === "must-mention") {
        const missing = terms.filter((t) => !found.includes(t));
        return result(missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : "all facts present");
      }
      return result(found.length === 0, found.length ? `claims not in the specs: ${found.join(", ")}` : "no invented claims");
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
      // Code decides when it can: the recorded judge once called a plain "yes" a refusal.
      const direct = grader.expects === "expected-answer" ? readOneWordVerdict(output) : null;
      if (direct) {
        const expected = normalize(evalCase.expected?.[locale] ?? "", true) === "no" ? "no" : "yes";
        return result(direct === expected, `${direct} · read directly`);
      }
      const verdict = await context.judge(grader, evalCase, output);
      return result(verdict.pass, verdict.note);
    }
  }
}
