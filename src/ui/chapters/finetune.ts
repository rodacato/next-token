import { runEval } from "../../evals/runner";
import type { EvalRun, EvalSet } from "../../evals/types";
import { tableAdapter } from "../../llm/adapters/table";

export type FinetuneAnswer = { setId: string; caseId: string; locale: string; input: string; output: string };
export type FinetuneRecording = {
  recordedAt: string;
  via: string;
  machine: string;
  completions: {
    training: {
      rows: number;
      seconds: number;
      losses: { iter: number; train: number }[];
      valLosses?: { iter: number; val: number }[];
      trainablePercent: number | null;
      trainableMillions: number | null;
      config: { model: string; rank: number; num_layers: number; iters: number; learning_rate: number; batch_size: number };
    };
    before: FinetuneAnswer[];
    after: FinetuneAnswer[];
  };
};
export type When = "before" | "after";

export const loadFinetune = () => import("../../recordings/minicpm/finetune.json").then((m) => m.default as unknown as FinetuneRecording);

// The Act II runner, unchanged: a contender is just a system prompt and a template; the model sits behind the port.
export function runFinetuneEval(recording: FinetuneRecording, set: EvalSet, when: When, locale: string): Promise<EvalRun> {
  const port = tableAdapter(`MiniCPM5-2B ${when === "after" ? "+ LoRA" : ""}`.trim(), recording.recordedAt, recording.completions[when].filter((a) => a.setId === set.id));
  return runEval(set, { id: when, system: "", template: "{{input}}" }, { locale, llm: port, maxTokens: 300 });
}

export const passed = (run: EvalRun, graderId: string, caseIds?: readonly string[]) =>
  run.results.filter((r) => (!caseIds || caseIds.includes(r.caseId)) && r.grades.find((g) => g.graderId === graderId)?.pass).length;
