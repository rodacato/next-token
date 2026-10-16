import "@tensorflow/tfjs-backend-cpu";
import * as tf from "@tensorflow/tfjs-core";
import { beforeAll, describe, expect, it } from "vitest";
import { CharModel } from "./model";
import { splitCorpus, TrainingSession } from "./session";

const lines = ["the early bird catches the worm.", "a stitch in time saves nine.", "look before you leap.", "haste makes waste.", "time is money."];
const config = { shape: { block: 16, dim: 16, heads: 2, layers: 1 }, batch: 8, learningRate: 0.01, seed: 3, valShare: 0 };

beforeAll(async () => {
  await tf.setBackend("cpu");
});

describe("the trainer", () => {
  it("learns: the loss falls", async () => {
    const session = new TrainingSession(config, { train: lines, val: [] });
    const before = await session.validate(1);
    await session.train(60);
    expect(await session.validate(1)).toBeLessThan(before * 0.8);
    session.dispose();
  });

  it("trains a LoRA adapter without touching the base weights", async () => {
    const session = new TrainingSession(config, { train: lines, val: [] });
    await session.train(10);
    const base = Array.from(await (session.model.weights.get("l0.qkv") as tf.Variable).data());
    session.trainLoraOnly({ rank: 2, alpha: 4 });
    expect(session.model.count("lora")).toBe(16 * 2 + 2 * 48 + 16 * 2 + 2 * 16);
    await session.train(10);
    expect(Array.from(await (session.model.weights.get("l0.qkv") as tf.Variable).data())).toEqual(base);
    session.dispose();
  });

  it("saves and restores the same model", async () => {
    const session = new TrainingSession(config, { train: lines, val: [] });
    await session.train(5);
    const restored = CharModel.restore(await session.model.save());
    const input = tf.tensor2d([session.model.encode("the early")], [1, 9], "int32");
    expect(Array.from(restored.logits(input).dataSync())).toEqual(Array.from(session.model.logits(input).dataSync()));
    session.dispose();
  });

  it("keeps whole lines on one side of the split", () => {
    const { train, val } = splitCorpus(lines, 0.4, 1);
    expect([...train, ...val].sort()).toEqual([...lines].sort());
    expect(train.filter((l) => val.includes(l))).toEqual([]);
  });
});
