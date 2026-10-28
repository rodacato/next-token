// The review board's rubric: deterministic checks on what the learner wrote. No model grades the finale.
// The prompt is free text and never scored: a keyword check can't tell "use the tool" from "never use the tool".
export type CaseTag = "normal" | "edge" | "regression";
export type Submission = {
  readonly goal: string;
  readonly users: string;
  readonly nonGoals: string;
  readonly metric: string;
  readonly prompt: string;
  readonly source: string;
  readonly whenUnsure: string;
  readonly maxSentences: number;
  readonly couponCeilingMxn: number;
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

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function review(s: Submission): Check[] {
  return [
    { id: "goal", member: "product", pass: words(s.goal) >= 12 },
    { id: "users", member: "product", pass: words(s.users) >= 3 },
    { id: "non-goals", member: "product", pass: s.nonGoals.split("\n").some((l) => words(l) >= 2) },
    { id: "metric", member: "product", pass: /\d/.test(s.metric) },
    { id: "source", member: "support", pass: s.source === "order-lookup" },
    { id: "unsure", member: "support", pass: s.whenUnsure === "hand-off" },
    { id: "format", member: "support", pass: s.maxSentences >= 1 && s.maxSentences <= 5 },
    { id: "compensation", member: "support", pass: s.couponCeilingMxn > 0 && s.couponCeilingMxn <= 150 },
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
