import { chapters } from "../content";
import { inferenceClient } from "./client";
import { recordStep, type RecordedRun, type RecordedStep } from "./recording";
import { detectDevice, findModel, type LocalModel, type ModelDevice } from "./registry";
import { SHORTLIST } from "./compositor";
import type { FabricationChapter, StickChapter } from "../content/schema";
import type { NeedleRecording } from "./experiment-recordings";
import { composeSampled, runNeedle, splitReferences, type ComposedSort } from "./experiments";

const BRANCHING = [6, 3] as const;

type ExperimentRun = { needle: Omit<NeedleRecording, "recordedAt">; composition: { prompt: string; sampling: { temperature: number; topP: number; seed: number; repetitionPenalty: number }; sorts: ComposedSort[]; references: string[] } & Omit<NeedleRecording, "recordedAt" | "answer" | "results"> };

declare global {
  interface Window {
    probe?: (modelId: LocalModel["id"], context: string) => Promise<{ text: string; logit: number }[]>;
    composeProbe?: (modelId: LocalModel["id"], locale: string, sampling: FabricationChapter["sampling"], promptOverride?: string) => Promise<string[]>;
    recordRuns?: (locale: string, modelId: LocalModel["id"]) => Promise<RecordedRun>;
    recordExperiments?: (locale: string, modelId: LocalModel["id"]) => Promise<ExperimentRun>;
  }
}

// Lost-in-the-middle probabilities and a greedy reference list; references are checked later in Node.
window.recordExperiments = async (locale, modelId) => {
  const stick = chapters.find((c): c is StickChapter => c.kind === "stick");
  const fabrication = chapters.find((c): c is FabricationChapter => c.kind === "fabrication");
  if (!stick || !fabrication) throw new Error("Missing chapters for the experiments");
  const model = findModel(modelId);
  const device = await recorderDevice();
  const client = inferenceClient();
  await client.loadModel(modelId, device);
  const read = (context: string) => client.nextToken(context, SHORTLIST);
  const meta = { model: model.name, repo: model.repo, dtype: model.variants[device].dtype, device, locale };

  const [answerPiece] = await client.tokenize(modelId, stick.needle.answer);
  if (!answerPiece) throw new Error("Answer has no tokens");
  log(`needle answer token ${JSON.stringify(answerPiece.text)}`);
  const results = await runNeedle(stick, locale, answerPiece.tokenId, read);
  results.forEach((r) => log(`depth ${r.depth.toFixed(2)}: p=${r.probability.toFixed(3)} rank ${r.rank}`));

  const prompt = fabrication.referencePrompt[locale] ?? "";
  const sorts = await composeSampled(fabrication, prompt, read);
  const references = splitReferences(prompt, sorts, fabrication.references);
  references.forEach((r) => log(`ref: ${r}`));

  return { needle: { ...meta, answer: answerPiece.text, results }, composition: { ...meta, prompt, sampling: fabrication.sampling, sorts, references } };
};

// ?device=wasm forces the q8 weights, to compare against WebGPU q4f16.
const recorderDevice = async (): Promise<ModelDevice> => {
  const forced = new URLSearchParams(location.search).get("device");
  return forced === "wasm" || forced === "webgpu" ? forced : detectDevice();
};

const log = (line: string) => {
  const element = document.getElementById("log");
  if (element) element.textContent += `\n${line}`;
  console.log(line);
};

// Records the default copy and a shallow tree of likely continuations, so the recorded fan is playable.
window.recordRuns = async (locale, modelId) => {
  const chapter = chapters.find((c) => c.kind === "next-token");
  if (!chapter || chapter.kind !== "next-token") throw new Error("No next-token chapter");
  const start = chapter.defaultCopy[locale];
  if (!start) throw new Error(`No default copy for ${locale}`);

  const model = findModel(modelId);
  const device = await recorderDevice();
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

// For checking a recording by hand: the top candidates after any context.
window.probe = async (modelId, context) => {
  const client = inferenceClient();
  await client.loadModel(modelId, await recorderDevice());
  const result = await client.nextToken(context, 12);
  return result.candidates.map(({ text, logit }) => ({ text, logit }));
};

// For tuning a recording by hand: compose the chapter 4 list with other sampling settings.
window.composeProbe = async (modelId, locale, sampling, promptOverride) => {
  const fabrication = chapters.find((c): c is FabricationChapter => c.kind === "fabrication");
  if (!fabrication) throw new Error("Missing fabrication chapter");
  const client = inferenceClient();
  await client.loadModel(modelId, await recorderDevice());
  const prompt = promptOverride ?? fabrication.referencePrompt[locale] ?? "";
  const sorts = await composeSampled({ ...fabrication, sampling }, prompt, (context) => client.nextToken(context, SHORTLIST));
  return splitReferences(prompt, sorts, fabrication.references);
};
