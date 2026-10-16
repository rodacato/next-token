import type { TokenPiece } from "./protocol";
import { inferenceClient, type LoadProgress } from "./client";
import { findModel, type LocalModel } from "./registry";

export type TokenizerId = "o200k" | "qwen";

export type BenchTokenizer = {
  readonly id: TokenizerId;
  readonly needsDownloadBytes: number;
  encode(text: string, onProgress?: (p: LoadProgress) => void): Promise<readonly TokenPiece[]>;
};

let o200k: Promise<{ encode(text: string): number[]; decode(ids: number[]): string }> | undefined;

function loadO200k() {
  // The rank table is a few MB of JS, so it loads only when the bench needs it.
  o200k ??= Promise.all([import("js-tiktoken/lite"), import("js-tiktoken/ranks/o200k_base")]).then(
    ([{ Tiktoken }, ranks]) => new Tiktoken(ranks.default),
  );
  return o200k;
}

export const o200kTokenizer: BenchTokenizer = {
  id: "o200k",
  needsDownloadBytes: 0,
  async encode(text) {
    const encoder = await loadO200k();
    return encoder.encode(text).map((tokenId) => ({ tokenId, text: encoder.decode([tokenId]) }));
  },
};

export function modelTokenizer(modelId: LocalModel["id"]): BenchTokenizer {
  return {
    id: "qwen",
    needsDownloadBytes: findModel(modelId).tokenizerBytes,
    encode: (text, onProgress) => inferenceClient().tokenize(modelId, text, onProgress),
  };
}

export const REPLACEMENT_CHARACTER = "�";

export type SortFace = { readonly label: string; readonly leadingSpace: boolean; readonly fragment: boolean };

// A leading space travels with its sort; byte-level BPE can split one character across sorts.
export function sortFace(text: string): SortFace {
  const fragment = text.includes(REPLACEMENT_CHARACTER);
  if (/^ +$/.test(text)) return { label: "␣".repeat(text.length), leadingSpace: false, fragment: false };
  const leadingSpace = text.startsWith(" ");
  const body = leadingSpace ? text.slice(1) : text;
  const visible = body.replace(/\n/g, "↵").replace(/\t/g, "⇥").replace(/ /g, "·");
  return { label: (leadingSpace ? "·" : "") + (fragment ? "◦" : visible), leadingSpace, fragment };
}
