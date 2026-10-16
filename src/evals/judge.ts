import type { LlmPort } from "../llm/port";
import type { GradeContext } from "./graders";
import type { EvalCase, Grader } from "./types";

export type JudgeGrader = Extract<Grader, { kind: "llm-judge" }>;

// One definition of the judge request, used by the app and by the recipe generator so recordings match.
export function judgeRequest(grader: JudgeGrader, locale: string, input: string, output: string) {
  const labels = grader.labels;
  return {
    system: grader.rubric[locale] ?? "",
    prompt: `${labels.input[locale] ?? "Input"}:\n${input}\n\n${labels.output[locale] ?? "Output"}:\n${output}`,
  };
}

const firstLine = (text: string) => (text.trim().split("\n")[0] ?? "").trim();
const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// "pass" judges grade quality; "expected-answer" judges read the verdict out of a free-text reply.
export function parseVerdict(grader: JudgeGrader, evalCase: EvalCase, locale: string, text: string): { pass: boolean; note: string } {
  const head = plain(firstLine(text));
  const note = text.trim().split("\n").slice(1).join(" ").trim() || firstLine(text);
  if (grader.expects === "pass") return { pass: /\bpass\b/.test(head) && !/\bfail\b/.test(head), note };
  const read = /\b(yes|si)\b/.test(head) ? "yes" : /\bno\b/.test(head) ? "no" : "unclear";
  const expected = plain(evalCase.expected?.[locale] ?? "") === "no" ? "no" : "yes";
  return { pass: read === expected, note: `${read} · ${note}` };
}

export function llmJudge(llm: LlmPort, locale: string): GradeContext["judge"] {
  return async (grader, evalCase, output) => {
    const { system, prompt } = judgeRequest(grader, locale, evalCase.input[locale] ?? "", output);
    const completion = await llm.complete({ system, messages: [{ role: "user", content: prompt }], maxTokens: 200 });
    return parseVerdict(grader, evalCase, locale, completion.text);
  };
}
