import {
  AutoModelForCausalLM,
  AutoTokenizer,
  env,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  type ProgressInfo,
  type Tensor,
} from "@huggingface/transformers";
import type { WorkerRequest, WorkerResponse } from "./protocol";
import { findModel, type LocalModel, type ModelDevice } from "./registry";
import type { Candidate } from "./sampling";

env.allowLocalModels = false;
env.useBrowserCache = true;

const tokenizers = new Map<LocalModel["id"], Promise<PreTrainedTokenizer>>();
let loadedModel: { id: LocalModel["id"]; model: PreTrainedModel; device: ModelDevice } | undefined;

const reply = (message: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(message, { transfer });

function tokenizerFor(modelId: LocalModel["id"], requestId: number): Promise<PreTrainedTokenizer> {
  let pending = tokenizers.get(modelId);
  if (!pending) {
    pending = AutoTokenizer.from_pretrained(findModel(modelId).repo, { progress_callback: forwardProgress(requestId) });
    tokenizers.set(modelId, pending);
  }
  return pending;
}

function forwardProgress(requestId: number) {
  return (info: ProgressInfo) => {
    if (info.status === "progress_total") {
      reply({ type: "progress", requestId, file: info.name, loaded: info.loaded, total: info.total });
    }
  };
}

async function tokenize(modelId: LocalModel["id"], text: string, requestId: number) {
  const tokenizer = await tokenizerFor(modelId, requestId);
  const ids = tokenizer.encode(text, { add_special_tokens: false });
  const pieces = ids.map((tokenId) => ({ tokenId, text: tokenizer.decode([tokenId]) }));
  reply({ type: "tokens", requestId, pieces });
}

async function loadModel(modelId: LocalModel["id"], device: ModelDevice, requestId: number) {
  if (loadedModel?.id === modelId && loadedModel.device === device) {
    reply({ type: "loaded", requestId, device });
    return;
  }
  const spec = findModel(modelId);
  await tokenizerFor(modelId, requestId);
  const model = await AutoModelForCausalLM.from_pretrained(spec.repo, {
    dtype: spec.variants[device].dtype,
    device,
    progress_callback: forwardProgress(requestId),
  });
  loadedModel = { id: modelId, model, device };
  reply({ type: "loaded", requestId, device });
}

async function nextToken(text: string, shortlist: number, requestId: number) {
  if (!loadedModel) throw new Error("model-not-loaded");
  const started = performance.now();
  const tokenizer = await tokenizerFor(loadedModel.id, requestId);
  const inputs = tokenizer(text, { add_special_tokens: false });
  const ids = tokenizer.encode(text, { add_special_tokens: false });
  const pieces = ids.map((tokenId) => ({ tokenId, text: tokenizer.decode([tokenId]) }));
  const { logits } = (await loadedModel.model(inputs)) as { logits: Tensor };
  const [, sequenceLength = 0, vocabSize = 0] = logits.dims;
  const lastRow = logits.slice(null, sequenceLength - 1, null).to("float32").data as Float32Array;
  const row = new Float32Array(lastRow.subarray(0, vocabSize));
  const candidates = topCandidates(row, shortlist, tokenizer);
  reply(
    {
      type: "distribution",
      requestId,
      candidates,
      logits: row,
      pieces,
      elapsedMs: performance.now() - started,
    },
    [row.buffer],
  );
}

function topCandidates(row: Float32Array, count: number, tokenizer: PreTrainedTokenizer): Candidate[] {
  const ids = Array.from(row.keys());
  ids.sort((a, b) => (row[b] ?? -Infinity) - (row[a] ?? -Infinity));
  return ids.slice(0, count).map((tokenId) => ({ tokenId, text: tokenizer.decode([tokenId]), logit: row[tokenId] ?? -Infinity }));
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    switch (request.type) {
      case "load-tokenizer":
        await tokenizerFor(request.modelId, request.requestId);
        reply({ type: "tokens", requestId: request.requestId, pieces: [] });
        break;
      case "tokenize":
        await tokenize(request.modelId, request.text, request.requestId);
        break;
      case "load-model":
        await loadModel(request.modelId, request.device, request.requestId);
        break;
      case "next-token":
        await nextToken(request.text, request.shortlist, request.requestId);
        break;
    }
  } catch (error) {
    reply({ type: "failed", requestId: request.requestId, reason: error instanceof Error ? error.message : String(error) });
  }
};
