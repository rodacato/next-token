export type ModelDevice = "webgpu" | "wasm";

export type LocalModel = {
  readonly id: "qwen2.5-0.5b" | "smollm2-135m";
  readonly repo: string;
  readonly name: string;
  readonly license: "Apache-2.0";
  readonly multilingual: boolean;
  readonly tokenizerBytes: number;
  readonly variants: Readonly<Record<ModelDevice, { readonly dtype: "q4f16" | "q8"; readonly bytes: number }>>;
};

// Sizes verified against the Hugging Face API on 2026-10-16; see docs/adr/0002-in-browser-model.md.
export const localModels: readonly LocalModel[] = [
  {
    id: "qwen2.5-0.5b",
    repo: "onnx-community/Qwen2.5-0.5B",
    name: "Qwen2.5-0.5B",
    license: "Apache-2.0",
    multilingual: true,
    tokenizerBytes: 7_031_673,
    variants: {
      webgpu: { dtype: "q4f16", bytes: 483_003_582 },
      wasm: { dtype: "q8", bytes: 512_096_557 },
    },
  },
  {
    id: "smollm2-135m",
    repo: "HuggingFaceTB/SmolLM2-135M-Instruct",
    name: "SmolLM2-135M-Instruct",
    license: "Apache-2.0",
    multilingual: false,
    tokenizerBytes: 2_104_556,
    variants: {
      webgpu: { dtype: "q4f16", bytes: 117_691_126 },
      wasm: { dtype: "q8", bytes: 137_147_867 },
    },
  },
];

export const defaultModelId: LocalModel["id"] = "qwen2.5-0.5b";

export function findModel(id: LocalModel["id"]): LocalModel {
  const model = localModels.find((m) => m.id === id);
  if (!model) throw new Error(`Unknown model ${id}`);
  return model;
}

type GpuAdapter = { readonly features: ReadonlySet<string> };

// The q4f16 weights need shader-f16; adapters without it fall back to WASM with q8 weights.
export async function detectDevice(): Promise<ModelDevice> {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<GpuAdapter | null> } }).gpu;
  if (!gpu) return "wasm";
  try {
    const adapter = await gpu.requestAdapter();
    return adapter?.features.has("shader-f16") ? "webgpu" : "wasm";
  } catch {
    return "wasm";
  }
}
