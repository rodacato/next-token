import type { Checkpoint, LoraShape } from "./model";
import type { Sample, TrainConfig } from "./session";

export type TrainerBackend = "webgpu" | "webgl" | "cpu";

export type TrainerRequest =
  | {
      readonly type: "init";
      readonly config: TrainConfig;
      readonly train: readonly string[];
      readonly val: readonly string[];
      readonly base?: Checkpoint;
      readonly lora?: LoraShape;
    }
  | { readonly type: "train"; readonly steps: number; readonly every: number; readonly sampleEvery: number; readonly temperature: number }
  | { readonly type: "stop" }
  | { readonly type: "sample"; readonly count: number; readonly temperature: number; readonly seed: number; readonly loraOn: boolean }
  | { readonly type: "save" }
  | { readonly type: "fingerprint" };

export type TrainerResponse =
  | { readonly type: "ready"; readonly backend: TrainerBackend; readonly baseParams: number; readonly loraParams: number }
  | { readonly type: "progress"; readonly step: number; readonly train: number; readonly val: number; readonly elapsedMs: number; readonly samples?: readonly Sample[] }
  | { readonly type: "stopped"; readonly step: number }
  | { readonly type: "samples"; readonly samples: readonly Sample[] }
  | { readonly type: "saved"; readonly checkpoint: Checkpoint }
  | { readonly type: "fingerprint"; readonly value: string }
  | { readonly type: "failed"; readonly reason: string };
