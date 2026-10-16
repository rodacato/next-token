# 2. In-browser model: Qwen2.5-0.5B by default, SmolLM2-135M as the light option

Date: 2026-10-16 · Status: accepted

## Context

The probability fan needs real per-token logits from a model running in the
browser through Transformers.js, in a Web Worker, on WebGPU with a WASM
fallback. Spanish (Mexico) is a first-class locale.

Verified on the Hugging Face API on 2026-10-16:

| Model | Repo | License | WebGPU (q4f16) | WASM (q8) | Tokenizer |
| --- | --- | --- | --- | --- | --- |
| Qwen2.5-0.5B (base) | `onnx-community/Qwen2.5-0.5B` | Apache-2.0 (upstream `Qwen/Qwen2.5-0.5B`) | 483.0 MB (not used, see amendment) | 512.1 MB | 7.0 MB |
| SmolLM2-135M-Instruct | `HuggingFaceTB/SmolLM2-135M-Instruct` | Apache-2.0 | 117.7 MB | 137.1 MB | 2.1 MB |
| SmolLM2-360M-Instruct | `HuggingFaceTB/SmolLM2-360M-Instruct` | Apache-2.0 | 272.7 MB | 364.6 MB | — |

## Decision

- **Qwen2.5-0.5B (base)** is the default. It is multilingual, so the Spanish
  fan is meaningful. A base model is used because chapter 2 is about raw
  continuation, not chat. The size is shown before download, and the learner
  must opt in.
- **SmolLM2-135M-Instruct** is offered as the light option. It is
  English-centric, and the UI says so, which is itself a lesson for chapter 1.
- SmolLM2-360M is not offered. It is larger than 135M and still
  English-centric, so it adds nothing for a bilingual course.
- Weights are cached by Transformers.js in the browser's Cache Storage. The
  first visit downloads the model once; later visits read it from the cache.

## Amendment, 2026-10-16: q8 on every device

Phase A ran the same probes on both weight files:
- **q4f16 on WebGPU**: greedy decoding degenerated within a few tokens
  ("there was a little girl girl girl…", `"The" "The" "The"`).
- **q8 on WASM and on WebGPU**: coherent text, for example a correct
  Fibonacci function.

The single next-token fan in chapter 2 hid this. Multi-token writing
(chapter 4) exposed it.

Both models now use **q8 on both devices**: 512 MB for Qwen2.5-0.5B and
137 MB for SmolLM2-135M. WebGPU is still used only on adapters with
`shader-f16`, the configuration that was tested; anything else runs q8 on
WASM, multi-threaded when the page is cross-origin isolated. One weight file
per model also means one cache entry, whichever device is used.

## Consequences

- Before opt-in, and in CI, the fan replays **recorded runs** of the same
  model (`src/model/recordings/`), recorded with `npm run record:runs` and
  labeled with model, dtype, device and date. The tail of the vocabulary
  beyond the 64-token shortlist is stored as a 160-bin logit histogram, which
  reproduces the probabilities at any temperature to within 0.1%.
- The worker returns the full logit row (about 600 KB, transferred, not
  copied), so softmax at any temperature is exact on the main thread.
- Exact Claude token counts need Anthropic's token-counting API. The bench
  says so and does not estimate them.
