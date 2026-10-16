import { inferenceClient, type NextTokenResult } from "./client";
import { recordedRunSchema, replayStep, type RecordedRun } from "./recording";
import type { LocalModel, ModelDevice } from "./registry";

export type RunSource =
  | { readonly kind: "live"; readonly model: string; readonly device: ModelDevice }
  | { readonly kind: "recorded"; readonly model: string; readonly recordedAt: string };

export type Reading = NextTokenResult & { readonly source: RunSource };

export class NoRecordingError extends Error {
  constructor(readonly context: string) {
    super("no-recording");
  }
}

// The port every bench reads the next token through: a live model or a labeled recording.
export type Compositor = {
  readonly source: RunSource;
  read(context: string): Promise<Reading>;
};

export const SHORTLIST = 64;

export function liveCompositor(model: LocalModel, device: ModelDevice): Compositor {
  const source: RunSource = { kind: "live", model: model.name, device };
  return {
    source,
    read: async (context) => ({ ...(await inferenceClient().nextToken(context, SHORTLIST)), source }),
  };
}

export function recordedCompositor(run: RecordedRun): Compositor {
  const source: RunSource = { kind: "recorded", model: run.model, recordedAt: run.recordedAt };
  const steps = new Map(run.steps.map((step) => [step.context, step]));
  return {
    source,
    read: async (context) => {
      const step = steps.get(context);
      if (!step) throw new NoRecordingError(context);
      return { ...replayStep(step), source };
    },
  };
}

const recordingFiles = import.meta.glob("../recordings/next-token/*.json", { import: "default" });

export async function loadRecordedRun(locale: string): Promise<RecordedRun | undefined> {
  const loader = recordingFiles[`../recordings/next-token/${locale}.json`];
  return loader ? recordedRunSchema.parse(await loader()) : undefined;
}

export function recordedContexts(run: RecordedRun): ReadonlySet<string> {
  return new Set(run.steps.map((step) => step.context));
}
