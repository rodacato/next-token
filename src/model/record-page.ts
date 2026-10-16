import { chapters } from "../content";
import { inferenceClient } from "./client";
import { recordStep, type RecordedRun, type RecordedStep } from "./recording";
import { detectDevice, findModel, type LocalModel } from "./registry";
import { SHORTLIST } from "./compositor";

const BRANCHING = [6, 3] as const;

declare global {
  interface Window {
    recordRuns?: (locale: string, modelId: LocalModel["id"]) => Promise<RecordedRun>;
  }
}

const log = (line: string) => {
  const element = document.getElementById("log");
  if (element) element.textContent += `\n${line}`;
};

// Records the default copy and a shallow tree of likely continuations, so the recorded fan is playable.
window.recordRuns = async (locale, modelId) => {
  const chapter = chapters.find((c) => c.kind === "next-token");
  if (!chapter || chapter.kind !== "next-token") throw new Error("No next-token chapter");
  const start = chapter.defaultCopy[locale];
  if (!start) throw new Error(`No default copy for ${locale}`);

  const model = findModel(modelId);
  const device = await detectDevice();
  const client = inferenceClient();
  await client.loadModel(modelId, device, (p) => log(`loading ${Math.round((p.loaded / p.total) * 100)}%`));

  const steps: RecordedStep[] = [];
  let frontier = [start];
  for (let depth = 0; depth <= BRANCHING.length; depth++) {
    const next: string[] = [];
    for (const context of frontier) {
      const result = await client.nextToken(context, SHORTLIST);
      steps.push(recordStep(context, result));
      log(`${steps.length}: ${JSON.stringify(context)}`);
      const branching = BRANCHING[depth];
      if (branching) next.push(...result.candidates.slice(0, branching).map((c) => context + c.text));
    }
    frontier = next;
  }

  return {
    model: model.name,
    repo: model.repo,
    dtype: model.variants[device].dtype,
    device,
    recordedAt: new Date().toISOString().slice(0, 10),
    locale,
    vocabularySize: steps[0] ? steps[0].candidates.length + steps[0].tail.counts.reduce((sum, n) => sum + n, 0) : 0,
    steps,
  };
};
