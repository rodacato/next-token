import { TrainerClient } from "./client";
import type { Checkpoint, LoraShape } from "./model";
import type { TrainerResponse } from "./protocol";
import type { Sample, TrainConfig } from "./session";

export type TrainerRun = {
  backend: string;
  baseParams: number;
  loraParams: number;
  points: Extract<TrainerResponse, { type: "progress" }>[];
  stops: { step: number; samples: Sample[] }[];
  checkpoint?: Checkpoint;
  adapter?: { fingerprintBefore: string; fingerprintAfter: string; withAdapter: Sample[]; withoutAdapter: Sample[] };
};

type Job = {
  config: TrainConfig;
  train: string[];
  val: string[];
  stops: number[];
  sampleCount: number;
  sampleSeed: number;
  every: number;
  sampleEvery: number;
  temperature: number;
  base?: Checkpoint;
  lora?: LoraShape;
  save?: boolean;
  compareAdapter?: boolean;
};

declare global {
  interface Window {
    recordTraining?: (job: Job) => Promise<TrainerRun>;
  }
}

const log = (line: string) => {
  const el = document.getElementById("log");
  if (el) el.textContent += `\n${line}`;
  console.log(line);
};

// Runs one training job in the real worker, as the chapter does, and returns every point it streamed.
window.recordTraining = async (job) => {
  const client = new TrainerClient();
  client.send({ type: "init", config: job.config, train: job.train, val: job.val, ...(job.base ? { base: job.base } : {}), ...(job.lora ? { lora: job.lora } : {}) });
  const ready = await client.once("ready");
  log(`backend ${ready.backend}, ${ready.baseParams} base params, ${ready.loraParams} adapter params`);
  const points: TrainerRun["points"] = [];
  const stop = client.listen((m) => {
    if (m.type !== "progress") return;
    points.push(m);
    log(`step ${m.step} train ${m.train.toFixed(3)} val ${m.val.toFixed(3)} ${(m.elapsedMs / 1000).toFixed(1)}s${m.samples ? ` · ${m.samples.map((s) => s.text).join(" | ")}` : ""}`);
  });
  const fingerprint = async () => {
    client.send({ type: "fingerprint" });
    return (await client.once("fingerprint")).value;
  };
  const fingerprintBefore = job.compareAdapter ? await fingerprint() : "";
  const stops: TrainerRun["stops"] = [];
  let at = 0;
  for (const step of job.stops) {
    client.send({ type: "train", steps: step - at, every: job.every, sampleEvery: job.sampleEvery, temperature: job.temperature });
    at = (await client.once("stopped")).step;
    client.send({ type: "sample", count: job.sampleCount, temperature: job.temperature, seed: job.sampleSeed, loraOn: true });
    const { samples } = await client.once("samples");
    log(`at ${at}: ${samples.filter((x) => x.kind === "copied").length} of ${samples.length} copied`);
    stops.push({ step: at, samples: [...samples] });
  }
  stop();
  let adapter: TrainerRun["adapter"];
  if (job.compareAdapter) {
    const fingerprintAfter = await fingerprint();
    const sample = async (loraOn: boolean) => {
      client.send({ type: "sample", count: job.sampleCount, temperature: job.temperature, seed: job.sampleSeed, loraOn });
      return [...(await client.once("samples")).samples];
    };
    adapter = { fingerprintBefore, fingerprintAfter, withAdapter: await sample(true), withoutAdapter: await sample(false) };
    log(`base ${fingerprintBefore} → ${fingerprintAfter}`);
  }
  let checkpoint: Checkpoint | undefined;
  if (job.save) {
    client.send({ type: "save" });
    checkpoint = (await client.once("saved")).checkpoint;
  }
  client.terminate();
  return { backend: ready.backend, baseParams: ready.baseParams, loraParams: ready.loraParams, points, stops, ...(checkpoint ? { checkpoint } : {}), ...(adapter ? { adapter } : {}) };
};
