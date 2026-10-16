import "@tensorflow/tfjs-backend-cpu";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-webgpu";
import * as tf from "@tensorflow/tfjs-core";
import type { TrainerBackend, TrainerRequest, TrainerResponse } from "./protocol";
import { TrainingSession } from "./session";

let session: TrainingSession | null = null;
let stopping = false;
let backend: TrainerBackend | null = null;

const reply = (message: TrainerResponse) => self.postMessage(message);

async function pickBackend(): Promise<TrainerBackend> {
  for (const name of ["webgpu", "webgl", "cpu"] as const) {
    try {
      if (await tf.setBackend(name)) {
        await tf.ready();
        return name;
      }
    } catch {
      // Try the next one.
    }
  }
  return "cpu";
}

async function handle(request: TrainerRequest) {
  switch (request.type) {
    case "init": {
      backend ??= await pickBackend();
      session?.dispose();
      session = new TrainingSession(request.config, { train: request.train, val: request.val }, request.base);
      if (request.lora) session.trainLoraOnly(request.lora);
      reply({ type: "ready", backend, baseParams: session.model.count("base"), loraParams: session.model.count("lora") });
      break;
    }
    case "train": {
      if (!session) throw new Error("trainer-not-initialized");
      stopping = false;
      const started = performance.now();
      const target = session.step + request.steps;
      let chunk = 0;
      while (session.step < target && !stopping) {
        const train = await session.train(Math.min(request.every, target - session.step));
        const val = await session.validate();
        chunk++;
        const samples = chunk % request.sampleEvery === 0 ? session.sample(3, request.temperature, session.step) : undefined;
        reply({ type: "progress", step: session.step, train, val, elapsedMs: performance.now() - started, ...(samples ? { samples } : {}) });
      }
      reply({ type: "stopped", step: session.step });
      break;
    }
    case "stop":
      stopping = true;
      break;
    case "sample": {
      if (!session) throw new Error("trainer-not-initialized");
      const was = session.model.loraOn;
      session.model.loraOn = request.loraOn && session.model.lora.size > 0;
      reply({ type: "samples", samples: session.sample(request.count, request.temperature, request.seed) });
      session.model.loraOn = was;
      break;
    }
    case "fingerprint":
      if (!session) throw new Error("trainer-not-initialized");
      reply({ type: "fingerprint", value: await session.model.fingerprint() });
      break;
    case "save":
      if (!session) throw new Error("trainer-not-initialized");
      reply({ type: "saved", checkpoint: await session.model.save() });
      break;
  }
}

// "stop" must get through while "train" is running, so requests are not queued behind each other.
self.onmessage = (event: MessageEvent<TrainerRequest>) => {
  handle(event.data).catch((error: unknown) => reply({ type: "failed", reason: error instanceof Error ? error.message : String(error) }));
};
