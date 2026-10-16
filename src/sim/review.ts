// The review board's rubric: deterministic checks on what the learner wrote. No model grades the finale.
export type CaseTag = "normal" | "edge" | "regression";
export type Submission = {
  readonly goal: string;
  readonly users: string;
  readonly nonGoals: string;
  readonly metric: string;
  readonly prompt: string;
  readonly cases: readonly { readonly input: string; readonly expect: string; readonly tag: CaseTag }[];
  readonly graders: readonly string[];
  readonly guardrails: readonly string[];
  readonly firstStagePercent: number;
  readonly dailyCapUsd: number;
  readonly rollback: string;
  readonly monitor: string;
};

export type Member = "product" | "support" | "security" | "finance";
export type Check = { readonly id: string; readonly member: Member; readonly pass: boolean };
export type Keywords = Readonly<Record<"source" | "unsure" | "format" | "compensation" | "limit", readonly string[]>>;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const mentions = (text: string, terms: readonly string[]) => terms.some((t) => fold(text).includes(fold(t)));

export function review(s: Submission, k: Keywords): Check[] {
  const compensation = mentions(s.prompt, k.compensation);
  return [
    { id: "goal", member: "product", pass: words(s.goal) >= 12 },
    { id: "users", member: "product", pass: words(s.users) >= 3 },
    { id: "non-goals", member: "product", pass: s.nonGoals.split("\n").some((l) => words(l) >= 2) },
    { id: "metric", member: "product", pass: /\d/.test(s.metric) },
    { id: "source", member: "support", pass: mentions(s.prompt, k.source) },
    { id: "unsure", member: "support", pass: mentions(s.prompt, k.unsure) },
    { id: "format", member: "support", pass: mentions(s.prompt, k.format) || /\b\d+\b/.test(s.prompt) },
    { id: "compensation", member: "support", pass: !compensation || mentions(s.prompt, k.limit) },
    { id: "cases", member: "support", pass: s.cases.filter((c) => words(c.input) >= 3 && words(c.expect) >= 2).length >= 5 },
    { id: "edge", member: "support", pass: s.cases.some((c) => c.tag === "edge") },
    { id: "regression", member: "support", pass: s.cases.some((c) => c.tag === "regression") },
    { id: "graders", member: "support", pass: s.graders.length >= 2 && s.graders.some((g) => g !== "llm-judge") },
    { id: "gate", member: "security", pass: s.guardrails.includes("compensation-gate") },
    { id: "read-only", member: "security", pass: s.guardrails.includes("read-only-lookup") },
    { id: "injection", member: "security", pass: s.guardrails.includes("mark-untrusted") || s.guardrails.includes("output-filter") },
    { id: "refusal", member: "security", pass: s.guardrails.includes("honest-refusal") },
    { id: "staged", member: "finance", pass: s.firstStagePercent > 0 && s.firstStagePercent <= 10 },
    { id: "cap", member: "finance", pass: s.dailyCapUsd > 0 },
    { id: "rollback", member: "finance", pass: words(s.rollback) >= 6 },
    { id: "monitor", member: "finance", pass: words(s.monitor) >= 2 },
  ];
}

export const approves = (checks: readonly Check[], member: Member) => checks.filter((c) => c.member === member).every((c) => c.pass);
