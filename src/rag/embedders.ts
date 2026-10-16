export type Embedder = {
  readonly id: "multilingual-e5-small";
  readonly repo: string;
  readonly name: string;
  readonly license: "MIT";
  readonly dtype: "q8";
  readonly bytes: number;
  readonly dims: number;
};

// Sizes verified against the Hugging Face API on 2026-10-16: model_quantized.onnx plus tokenizer.json.
export const embedders: readonly Embedder[] = [
  {
    id: "multilingual-e5-small",
    repo: "Xenova/multilingual-e5-small",
    name: "multilingual-e5-small",
    license: "MIT",
    dtype: "q8",
    bytes: 118_308_185 + 17_082_730,
    dims: 384,
  },
];
