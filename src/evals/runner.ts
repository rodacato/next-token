import type { ZodType } from "zod";
import type { LlmPort } from "../llm/port";
import { grade, type GradeContext } from "./graders";
import { fillTemplate } from "./template";
import type { CaseResult, EvalRun, EvalSet } from "./types";

export type Contender = {
  readonly id: string;
  readonly system: string;
  readonly template: string;
};

export type RunOptions = {
  readonly locale: string;
  readonly llm: LlmPort;
  readonly maxTokens: number;
  readonly schemas?: Readonly<Record<string, ZodType>>;
  readonly jsonSchema?: Readonly<Record<string, unknown>>;
  readonly judge?: GradeContext["judge"];
  readonly onCase?: (result: CaseResult) => void;
};

const noJudge: GradeContext["judge"] = async () => ({ pass: false, note: "no judge configured" });

// Runs one contender over every case, grades each output with every grader, and keeps the bill.
export async function runEval(set: EvalSet, contender: Contender, options: RunOptions): Promise<EvalRun> {
  const results: CaseResult[] = [];
  const sources = new Set<string>();
  for (const evalCase of set.cases) {
    const input = evalCase.input[options.locale];
    if (input === undefined) continue;
    const completion = await options.llm.complete({
      system: contender.system,
      messages: [{ role: "user", content: fillTemplate(contender.template, input) }],
      maxTokens: options.maxTokens,
      ...(options.jsonSchema ? { jsonSchema: options.jsonSchema } : {}),
    });
    sources.add(completion.source.kind === "recorded" ? `${completion.source.model} · ${completion.source.recordedAt}` : completion.source.model);
    const context: GradeContext = {
      locale: options.locale,
      evalCase,
      output: completion.text,
      schemas: options.schemas ?? {},
      judge: options.judge ?? noJudge,
    };
    const grades = [];
    for (const grader of set.graders) grades.push(await grade(grader, context));
    const result: CaseResult = { caseId: evalCase.id, output: completion.text, grades, pass: grades.every((g) => g.pass), usage: completion.usage };
    results.push(result);
    options.onCase?.(result);
  }
  return {
    contenderId: contender.id,
    results,
    passed: results.filter((r) => r.pass).length,
    total: results.length,
    usage: results.reduce((sum, r) => ({ inputTokens: sum.inputTokens + r.usage.inputTokens, outputTokens: sum.outputTokens + r.usage.outputTokens }), { inputTokens: 0, outputTokens: 0 }),
    sources: [...sources],
  };
}
