import type { LocalModel, ModelDevice } from "./registry";
import type { Candidate } from "./sampling";

export type TokenPiece = { readonly tokenId: number; readonly text: string };

export type WorkerRequest =
  | { readonly type: "load-tokenizer"; readonly requestId: number; readonly modelId: LocalModel["id"] }
  | { readonly type: "load-model"; readonly requestId: number; readonly modelId: LocalModel["id"]; readonly device: ModelDevice }
  | { readonly type: "tokenize"; readonly requestId: number; readonly modelId: LocalModel["id"]; readonly text: string }
  | { readonly type: "next-token"; readonly requestId: number; readonly text: string; readonly shortlist: number };

export type WorkerResponse =
  | { readonly type: "progress"; readonly requestId: number; readonly file: string; readonly loaded: number; readonly total: number }
  | { readonly type: "loaded"; readonly requestId: number; readonly device: ModelDevice }
  | { readonly type: "tokens"; readonly requestId: number; readonly pieces: readonly TokenPiece[] }
  | {
      readonly type: "distribution";
      readonly requestId: number;
      readonly candidates: readonly Candidate[];
      readonly logits: Float32Array;
      readonly contextTokens: number;
      readonly elapsedMs: number;
    }
  | { readonly type: "failed"; readonly requestId: number; readonly reason: string };
