import type { TokenPiece, WorkerRequest, WorkerResponse } from "./protocol";
import type { LocalModel, ModelDevice } from "./registry";
import type { Candidate } from "./sampling";

export type LoadProgress = { readonly loaded: number; readonly total: number };

export type NextTokenResult = {
  readonly candidates: readonly Candidate[];
  readonly logits: Float32Array;
  readonly pieces: readonly TokenPiece[];
  readonly elapsedMs: number;
};

type Pending = {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
  onProgress: ((progress: LoadProgress) => void) | undefined;
};

type RequestBody = WorkerRequest extends infer R ? (R extends WorkerRequest ? Omit<R, "requestId"> : never) : never;

export class InferenceClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextRequestId = 1;

  constructor() {
    this.worker = new Worker(new URL("./inference.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.settle(event.data);
  }

  async tokenize(modelId: LocalModel["id"], text: string, onProgress?: (p: LoadProgress) => void): Promise<readonly TokenPiece[]> {
    const response = await this.request({ type: "tokenize", modelId, text }, onProgress);
    if (response.type !== "tokens") throw new Error(`Unexpected ${response.type}`);
    return response.pieces;
  }

  async loadModel(modelId: LocalModel["id"], device: ModelDevice, onProgress?: (p: LoadProgress) => void): Promise<ModelDevice> {
    const response = await this.request({ type: "load-model", modelId, device }, onProgress);
    if (response.type !== "loaded") throw new Error(`Unexpected ${response.type}`);
    return response.device;
  }

  async nextToken(text: string, shortlist: number): Promise<NextTokenResult> {
    const response = await this.request({ type: "next-token", text, shortlist });
    if (response.type !== "distribution") throw new Error(`Unexpected ${response.type}`);
    return response;
  }

  async embed(repo: string, dtype: "q8", texts: readonly string[], onProgress?: (p: LoadProgress) => void): Promise<readonly Float32Array[]> {
    const response = await this.request({ type: "embed", repo, dtype, texts }, onProgress);
    if (response.type !== "embeddings") throw new Error(`Unexpected ${response.type}`);
    return response.vectors;
  }

  private request(body: RequestBody, onProgress?: (p: LoadProgress) => void): Promise<WorkerResponse> {
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject, onProgress });
      this.worker.postMessage({ ...body, requestId } as WorkerRequest);
    });
  }

  private settle(response: WorkerResponse) {
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    if (response.type === "progress") {
      pending.onProgress?.({ loaded: response.loaded, total: response.total });
      return;
    }
    this.pending.delete(response.requestId);
    if (response.type === "failed") pending.reject(new Error(response.reason));
    else pending.resolve(response);
  }
}

let shared: InferenceClient | undefined;

export function inferenceClient(): InferenceClient {
  shared ??= new InferenceClient();
  return shared;
}
