import { useCallback, useMemo, useState } from "react";
import { llmJudge } from "../../evals/judge";
import { runEval, type Contender } from "../../evals/runner";
import { fillTemplate } from "../../evals/template";
import type { EvalRun, EvalSet } from "../../evals/types";
import { BudgetExceededError, UnknownPriceError } from "../../llm/costGuard";
import { NoRecordedRunError } from "../../llm/port";
import { useLlm } from "../LlmProvider";

export type RunPlan = { readonly calls: number; readonly maxUsd: number | null; readonly exact: boolean };

export type RunState =
  | { readonly status: "idle" }
  | { readonly status: "estimating" }
  | { readonly status: "confirm"; readonly plan: RunPlan }
  | { readonly status: "running"; readonly done: number; readonly total: number }
  | { readonly status: "done"; readonly runs: readonly EvalRun[] }
  | { readonly status: "failed"; readonly reason: "no-recording" | "budget" | "unknown-price" | "error"; readonly detail: string };

export function useEvalRun(set: EvalSet | null, contenders: readonly Contender[], locale: string, maxTokens: number) {
  const llm = useLlm();
  const [state, setState] = useState<RunState>({ status: "idle" });
  const judged = set?.graders.some((g) => g.kind === "llm-judge") ?? false;
  const cases = useMemo(() => set?.cases.filter((c) => c.input[locale] !== undefined) ?? [], [set, locale]);
  const calls = contenders.length * cases.length * (judged ? 2 : 1);

  const execute = useCallback(async () => {
    if (!set) return;
    let done = 0;
    setState({ status: "running", done, total: contenders.length * cases.length });
    try {
      const runs: EvalRun[] = [];
      for (const contender of contenders) {
        runs.push(
          await runEval(set, contender, {
            locale,
            llm: llm.port,
            maxTokens,
            judge: llmJudge(llm.port, locale),
            onCase: () => setState({ status: "running", done: ++done, total: contenders.length * cases.length }),
          }),
        );
      }
      setState({ status: "done", runs });
    } catch (error) {
      if (error instanceof NoRecordedRunError) setState({ status: "failed", reason: "no-recording", detail: error.requestHash });
      else if (error instanceof BudgetExceededError) setState({ status: "failed", reason: "budget", detail: String(error.capUsd) });
      else if (error instanceof UnknownPriceError) setState({ status: "failed", reason: "unknown-price", detail: error.model });
      else setState({ status: "failed", reason: "error", detail: error instanceof Error ? error.message : String(error) });
    }
  }, [set, contenders, cases.length, locale, llm.port, maxTokens]);

  // Live runs are priced first and need a yes; recorded runs cost nothing and start at once.
  const start = useCallback(async () => {
    if (!set) return;
    if (!llm.live) return execute();
    setState({ status: "estimating" });
    try {
      const estimates = await Promise.all(
        contenders.flatMap((contender) =>
          cases.map((c) =>
            llm.port.estimate({ system: contender.system, messages: [{ role: "user", content: fillTemplate(contender.template, c.input[locale] ?? "") }], maxTokens }),
          ),
        ),
      );
      const perCall = estimates.map((e) => e.maxUsd);
      const known = perCall.every((usd) => usd !== null);
      const sum = perCall.reduce<number>((total, usd) => total + (usd ?? 0), 0);
      setState({ status: "confirm", plan: { calls, maxUsd: known ? sum * (judged ? 2 : 1) : null, exact: estimates.every((e) => e.exactInputCount) } });
    } catch (error) {
      setState({ status: "failed", reason: "error", detail: error instanceof Error ? error.message : String(error) });
    }
  }, [set, llm.live, llm.port, execute, contenders, cases, locale, maxTokens, calls, judged]);

  return { state, start, confirm: execute, cancel: () => setState({ status: "idle" }), live: llm.live };
}
