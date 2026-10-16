import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-core/dist/register_all_gradients.js";
import { mulberry32 } from "./random.ts";

export { mulberry32 };

// A tiny GPT: characters in, next character out. An intuition tool, not real training.
export type ModelShape = { readonly block: number; readonly dim: number; readonly heads: number; readonly layers: number };
export type LoraShape = { readonly rank: number; readonly alpha: number };
export type Checkpoint = {
  readonly shape: ModelShape;
  readonly vocab: string;
  readonly weights: Record<string, { shape: number[]; data: string }>;
};

export class CharModel {
  readonly weights = new Map<string, tf.Variable>();
  readonly lora = new Map<string, tf.Variable>();
  loraScale = 0;
  loraOn = false;
  private readonly index: Map<string, number>;

  readonly shape: ModelShape;
  readonly vocab: string;

  constructor(shape: ModelShape, vocab: string, seed: number) {
    this.shape = shape;
    this.vocab = vocab;
    this.index = new Map([...vocab].map((c, i) => [c, i]));
    const { dim, block, layers } = shape;
    let s = seed;
    const normal = (name: string, dims: number[], std = 0.02) => this.weights.set(name, tf.variable(tf.randomNormal(dims, 0, std, "float32", s++), true));
    const fill = (name: string, dims: number[], value: number) => this.weights.set(name, tf.variable(tf.fill(dims, value), true));
    normal("tok", [vocab.length, dim]);
    normal("pos", [block, dim]);
    for (let l = 0; l < layers; l++) {
      fill(`l${l}.ln1.g`, [dim], 1);
      fill(`l${l}.ln1.b`, [dim], 0);
      normal(`l${l}.qkv`, [dim, 3 * dim]);
      normal(`l${l}.o`, [dim, dim], 0.02 / Math.sqrt(2 * layers));
      fill(`l${l}.ln2.g`, [dim], 1);
      fill(`l${l}.ln2.b`, [dim], 0);
      normal(`l${l}.w1`, [dim, 4 * dim]);
      fill(`l${l}.b1`, [4 * dim], 0);
      normal(`l${l}.w2`, [4 * dim, dim], 0.02 / Math.sqrt(2 * layers));
      fill(`l${l}.b2`, [dim], 0);
    }
    fill("lnf.g", [dim], 1);
    fill("lnf.b", [dim], 0);
    normal("head", [dim, vocab.length]);
  }

  encode(text: string): number[] {
    return [...text].map((c) => this.index.get(c) ?? 0);
  }

  decode(ids: readonly number[]): string {
    return ids.map((i) => this.vocab[i] ?? "").join("");
  }

  count(which: "base" | "lora"): number {
    return [...(which === "base" ? this.weights : this.lora).values()].reduce((sum, v) => sum + v.size, 0);
  }

  // LoRA on the attention projections: W stays frozen, B·A (B starts at zero) is added on top.
  addLora({ rank, alpha }: LoraShape, seed: number) {
    this.dropLora();
    const { dim, layers } = this.shape;
    let s = seed;
    for (let l = 0; l < layers; l++)
      for (const [name, out] of [["qkv", 3 * dim], ["o", dim]] as const) {
        this.lora.set(`l${l}.${name}.A`, tf.variable(tf.randomNormal([dim, rank], 0, 1 / Math.sqrt(dim), "float32", s++), true));
        this.lora.set(`l${l}.${name}.B`, tf.variable(tf.zeros([rank, out]), true));
      }
    this.loraScale = alpha / rank;
    this.loraOn = true;
  }

  dropLora() {
    for (const v of this.lora.values()) v.dispose();
    this.lora.clear();
    this.loraOn = false;
  }

  private w(name: string): tf.Variable {
    const v = this.weights.get(name);
    if (!v) throw new Error(`No weight ${name}`);
    return v;
  }

  private project(x: tf.Tensor2D, layer: number, name: "qkv" | "o"): tf.Tensor2D {
    const base: tf.Tensor = tf.matMul(x, this.w(`l${layer}.${name}`) as tf.Tensor2D);
    const a = this.lora.get(`l${layer}.${name}.A`);
    const b = this.lora.get(`l${layer}.${name}.B`);
    const out = this.loraOn && a && b ? tf.add(base, tf.mul(tf.matMul(tf.matMul(x, a as tf.Tensor2D), b as tf.Tensor2D), this.loraScale)) : base;
    return out as tf.Tensor2D;
  }

  logits(idx: tf.Tensor2D): tf.Tensor2D {
    const [batch, time] = idx.shape;
    const { dim, heads, layers } = this.shape;
    const hd = dim / heads;
    const norm = (x: tf.Tensor, g: string, b: string) => {
      const { mean, variance } = tf.moments(x, -1, true);
      return tf.add(tf.mul(tf.div(tf.sub(x, mean), tf.sqrt(tf.add(variance, 1e-5))), this.w(g)), this.w(b));
    };
    const causal = tf.mul(tf.sub(1, tf.linalg.bandPart(tf.ones([time, time]), -1, 0)), -1e9);
    let x: tf.Tensor = tf.add(tf.gather(this.w("tok"), idx), tf.slice(this.w("pos"), [0, 0], [time, dim]));
    for (let l = 0; l < layers; l++) {
      const h = tf.reshape(norm(x, `l${l}.ln1.g`, `l${l}.ln1.b`), [batch * time, dim]) as tf.Tensor2D;
      const qkv = tf.transpose(tf.reshape(this.project(h, l, "qkv"), [batch, time, 3, heads, hd]), [2, 0, 3, 1, 4]);
      const [q, k, v] = tf.unstack(qkv) as [tf.Tensor4D, tf.Tensor4D, tf.Tensor4D];
      const att = tf.softmax(tf.add(tf.mul(tf.matMul(q, k, false, true), 1 / Math.sqrt(hd)), causal));
      const y = tf.reshape(tf.transpose(tf.matMul(att, v), [0, 2, 1, 3]), [batch * time, dim]) as tf.Tensor2D;
      x = tf.add(x, tf.reshape(this.project(y, l, "o"), [batch, time, dim]));
      const h2 = tf.reshape(norm(x, `l${l}.ln2.g`, `l${l}.ln2.b`), [batch * time, dim]) as tf.Tensor2D;
      const up = tf.add(tf.matMul(h2, this.w(`l${l}.w1`)), this.w(`l${l}.b1`));
      const act = tf.mul(up, tf.sigmoid(tf.mul(up, 1.702)));
      x = tf.add(x, tf.reshape(tf.add(tf.matMul(act, this.w(`l${l}.w2`)), this.w(`l${l}.b2`)), [batch, time, dim]));
    }
    const out = tf.reshape(norm(x, "lnf.g", "lnf.b"), [batch * time, dim]) as tf.Tensor2D;
    return tf.matMul(out, this.w("head"));
  }

  loss(x: tf.Tensor2D, y: tf.Tensor2D): tf.Scalar {
    const logits = this.logits(x);
    const targets = tf.oneHot(tf.reshape(y, [-1]) as tf.Tensor1D, this.vocab.length);
    return tf.neg(tf.mean(tf.sum(tf.mul(targets, tf.logSoftmax(logits)), -1)));
  }

  // One line, sampled a character at a time until a newline.
  sampleLine(prompt: string, temperature: number, rand: () => number, maxLength = 90): string {
    const ids = this.encode("\n" + prompt);
    const newline = this.index.get("\n") ?? 0;
    for (let n = 0; n < maxLength; n++) {
      const context = ids.slice(-this.shape.block);
      const probs = tf.tidy(() => {
        const logits = this.logits(tf.tensor2d([context], [1, context.length], "int32"));
        const last = tf.slice(logits, [context.length - 1, 0], [1, -1]);
        return tf.softmax(tf.div(last, Math.max(temperature, 1e-3)));
      });
      const p = probs.dataSync();
      probs.dispose();
      let r = rand();
      let next = p.length - 1;
      for (let i = 0; i < p.length; i++) {
        r -= p[i] ?? 0;
        if (r <= 0) {
          next = i;
          break;
        }
      }
      if (next === newline) break;
      ids.push(next);
    }
    return this.decode(ids.slice(1));
  }

  // FNV-1a over every base weight's bytes: if this doesn't change, the base model didn't.
  async fingerprint(): Promise<string> {
    let hash = 0x811c9dc5;
    for (const name of [...this.weights.keys()].sort()) {
      const data = (await this.weights.get(name)?.data()) as Float32Array;
      const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      for (const b of bytes) hash = Math.imul(hash ^ b, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
  }

  async save(): Promise<Checkpoint> {
    const weights: Checkpoint["weights"] = {};
    for (const [name, v] of this.weights) weights[name] = { shape: v.shape, data: toBase64(await v.data() as Float32Array) };
    return { shape: this.shape, vocab: this.vocab, weights };
  }

  static restore(checkpoint: Checkpoint): CharModel {
    const model = new CharModel(checkpoint.shape, checkpoint.vocab, 0);
    for (const [name, saved] of Object.entries(checkpoint.weights)) model.w(name).assign(tf.tensor(fromBase64(saved.data), saved.shape));
    return model;
  }

  dispose() {
    this.dropLora();
    for (const v of this.weights.values()) v.dispose();
  }
}

export function toBase64(v: Float32Array): string {
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(s: string): Float32Array {
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}
