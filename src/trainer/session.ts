import * as tf from "@tensorflow/tfjs-core";
export { splitCorpus, vocabularyOf } from "./corpus.ts";
import { vocabularyOf } from "./corpus.ts";
import { CharModel, mulberry32, type Checkpoint, type LoraShape, type ModelShape } from "./model.ts";

export type TrainConfig = {
  readonly shape: ModelShape;
  readonly batch: number;
  readonly learningRate: number;
  readonly seed: number;
  readonly valShare: number;
};

export type LossPoint = { readonly step: number; readonly train: number; readonly val: number };
export type Sample = { readonly text: string; readonly kind: "copied" | "held-out" | "new" };

export class TrainingSession {
  readonly model: CharModel;
  step = 0;
  private readonly trainIds: Int32Array;
  private readonly valIds: Int32Array;
  private readonly trainSet: ReadonlySet<string>;
  private readonly valSet: ReadonlySet<string>;
  private readonly rand: () => number;
  private optimizer: tf.Optimizer;
  private trainable: tf.Variable[];

  private readonly config: TrainConfig;

  constructor(config: TrainConfig, lines: { train: readonly string[]; val: readonly string[] }, base?: Checkpoint) {
    this.config = config;
    const vocab = base?.vocab ?? vocabularyOf([...lines.train, ...lines.val]);
    this.model = base ? CharModel.restore(base) : new CharModel(config.shape, vocab, config.seed);
    const ids = (ls: readonly string[]) => Int32Array.from(this.model.encode(ls.map((l) => `\n${l}`).join("") + "\n"));
    this.trainIds = ids(lines.train);
    this.valIds = ids(lines.val.length ? lines.val : lines.train);
    this.trainSet = new Set(lines.train);
    this.valSet = new Set(lines.val);
    this.rand = mulberry32(config.seed + 1);
    this.optimizer = tf.train.adam(config.learningRate);
    this.trainable = [...this.model.weights.values()];
  }

  // From now on only the adapter learns; the base weights stay exactly as they are.
  trainLoraOnly(lora: LoraShape) {
    this.model.addLora(lora, this.config.seed + 7);
    this.optimizer.dispose();
    this.optimizer = tf.train.adam(this.config.learningRate);
    this.trainable = [...this.model.lora.values()];
  }

  private batch(ids: Int32Array, rand: () => number) {
    const { batch } = this.config;
    const block = this.model.shape.block;
    const x = new Int32Array(batch * block);
    const y = new Int32Array(batch * block);
    for (let b = 0; b < batch; b++) {
      const start = Math.floor(rand() * Math.max(1, ids.length - block - 1));
      for (let t = 0; t < block; t++) {
        x[b * block + t] = ids[start + t] ?? 0;
        y[b * block + t] = ids[start + t + 1] ?? 0;
      }
    }
    return { x: tf.tensor2d(x, [batch, block], "int32"), y: tf.tensor2d(y, [batch, block], "int32") };
  }

  async train(steps: number): Promise<number> {
    let last: tf.Scalar | null = null;
    for (let i = 0; i < steps; i++) {
      last?.dispose();
      last = tf.tidy(() => {
        const { x, y } = this.batch(this.trainIds, this.rand);
        return this.optimizer.minimize(() => this.model.loss(x, y), true, this.trainable) as tf.Scalar;
      });
      this.step++;
    }
    const value = last ? (await last.data())[0] ?? NaN : NaN;
    last?.dispose();
    return value;
  }

  // The same validation batches every time, so the curve moves only when the model does.
  async validate(batches = 4): Promise<number> {
    const rand = mulberry32(this.config.seed + 99);
    let total = 0;
    for (let i = 0; i < batches; i++) {
      const loss = tf.tidy(() => {
        const { x, y } = this.batch(this.valIds, rand);
        return this.model.loss(x, y);
      });
      total += (await loss.data())[0] ?? 0;
      loss.dispose();
    }
    return total / batches;
  }

  sample(count: number, temperature: number, seed: number, prompt = ""): Sample[] {
    const rand = mulberry32(seed);
    return Array.from({ length: count }, () => {
      const text = this.model.sampleLine(prompt, temperature, rand).trim();
      return { text, kind: this.trainSet.has(text) ? "copied" : this.valSet.has(text) ? "held-out" : "new" };
    });
  }

  dispose() {
    this.optimizer.dispose();
    this.model.dispose();
  }
}
