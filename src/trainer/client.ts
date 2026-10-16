import type { TrainerRequest, TrainerResponse } from "./protocol";

type Listener = (message: TrainerResponse) => void;

// One worker per bench; the bench listens to everything it streams.
export class TrainerClient {
  private readonly worker: Worker;
  private readonly listeners = new Set<Listener>();

  constructor() {
    this.worker = new Worker(new URL("./trainer.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<TrainerResponse>) => {
      for (const listener of this.listeners) listener(event.data);
    };
  }

  send(request: TrainerRequest) {
    this.worker.postMessage(request);
  }

  listen(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Resolves on the first message of the given type, or rejects on a failure.
  once<T extends TrainerResponse["type"]>(type: T): Promise<Extract<TrainerResponse, { type: T }>> {
    return new Promise((resolve, reject) => {
      const stop = this.listen((message) => {
        if (message.type === type) {
          stop();
          resolve(message as Extract<TrainerResponse, { type: T }>);
        } else if (message.type === "failed") {
          stop();
          reject(new Error(message.reason));
        }
      });
    });
  }

  terminate() {
    this.worker.terminate();
    this.listeners.clear();
  }
}
