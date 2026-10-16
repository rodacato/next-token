import { z } from "zod";
import { jsonSchemaFor } from "./schemas.ts";

export type Row = { readonly id: string; readonly locale: string; readonly customer: string; readonly reply: string };
export type Finding = { readonly check: "exact-duplicate" | "near-duplicate" | "eval-leak"; readonly of: string };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const words = (s: string) => norm(s).split(" ").filter(Boolean);

export function jaccard(a: string, b: string): number {
  const x = new Set(words(a));
  const y = new Set(words(b));
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / Math.max(1, x.size + y.size - shared);
}

function shingles(s: string, n: number): Set<string> {
  const w = words(s);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

// Mechanical checks only: they compare text with text. Whether a reply is right is a different question.
export function mechanicalChecks(rows: readonly Row[], evalInputs: readonly string[], options = { nearWords: 0.5, leakWords: 8 }): Map<string, Finding[]> {
  const found = new Map<string, Finding[]>();
  const evalShingles = evalInputs.map((input) => shingles(input, options.leakWords));
  rows.forEach((row, i) => {
    const earlier = rows.slice(0, i);
    const findings: Finding[] = [];
    const exact = earlier.find((e) => norm(e.customer) === norm(row.customer) && norm(e.reply) === norm(row.reply));
    const near = exact ? undefined : earlier.find((e) => norm(e.reply) === norm(row.reply) || jaccard(e.customer, row.customer) >= options.nearWords);
    if (exact) findings.push({ check: "exact-duplicate", of: exact.id });
    if (near) findings.push({ check: "near-duplicate", of: near.id });
    const own = shingles(row.customer, options.leakWords);
    const leak = evalShingles.findIndex((set) => [...own].some((x) => set.has(x)));
    if (leak >= 0) findings.push({ check: "eval-leak", of: evalInputs[leak] ?? "" });
    if (findings.length) found.set(row.id, findings);
  });
  return found;
}

// The judge reads one row against the policy sheet. Quote first, verdicts after.
export const rowVerdictSchema = z.object({
  quote: z.string(),
  policy: z.enum(["consistent", "contradicts", "not-covered"]),
  tone: z.enum(["ok", "rude"]),
  language: z.enum(["matches", "wrong"]),
});
export type RowVerdict = z.infer<typeof rowVerdictSchema>;
const rowVerdictJsonSchema = jsonSchemaFor(rowVerdictSchema);

export function rowJudgeRequest(system: string, template: string, policy: string, row: Row) {
  const prompt = template.replaceAll("{{policy}}", policy).replaceAll("{{customer}}", row.customer).replaceAll("{{reply}}", row.reply);
  return { system, prompt, jsonSchema: rowVerdictJsonSchema, maxTokens: 300 };
}

export function readRowVerdict(text: string): RowVerdict | null {
  try {
    const parsed = rowVerdictSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const judgeFlags = (v: RowVerdict | null) => (v ? v.policy === "contradicts" || v.tone === "rude" || v.language === "wrong" : false);
