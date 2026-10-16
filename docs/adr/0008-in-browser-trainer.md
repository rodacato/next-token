# 8. The in-browser trainer: TensorFlow.js core, a tiny char-level GPT

Date: 2026-10-16 · Status: accepted

## Context

Chapter 11 trains a model live, and chapter 15 trains a LoRA adapter on top
of it. Both need autograd, a GPU path and a fallback, inside a Web Worker.
The plan named TensorFlow.js with a hand-written fallback.

## Decision

- **TensorFlow.js core 4.22.0** with the WebGPU, WebGL and CPU backends,
  picked in that order. Only `tfjs-core` and the backends are imported, plus
  the gradient registrations; no layers API. 4.22.0 (January 2025) is the
  latest release. That's a maintenance risk, accepted because the model uses
  only basic ops. If it breaks, the fallback is a hand-written forward and
  backward pass for this one architecture.
- **The model** (`src/trainer/model.ts`) is a GPT in about 150 lines:
  - token and position embeddings, two pre-norm blocks with 4 heads, 64
    wide, 48 characters of context;
  - about 110k parameters, Adam at 3e-3, batch 32, seeded initialisation
    and batches.
- **LoRA** adds B·A (B starts at zero) to the attention projections. When an
  adapter trains, only A and B are handed to the optimiser. A test checks
  that the base weights are byte-identical afterwards.
- **Corpora** are about 200 traditional proverbs per language, in the public
  domain. Whole lines go to training or held-out (10%), so the held-out
  loss measures lines the model never saw.
- **Recordings** come from the real worker in full headless Chromium on
  WebGPU (`npm run record:trainer`), for machines without a GPU. The chapter
  defaults to replaying them; training live is one click.

## Consequences

- On an M2 Max (WebGPU), 2,000 steps take about 30 s. Held-out loss bottoms
  out near step 250–300 and then climbs. By step 2,000, 7 of 12 sampled
  English lines and 9 of 12 Spanish lines are training lines copied whole.
  The chapter is built on that overfit.
- Runs are seeded but not bit-reproducible across GPUs. On the same GPU the
  early samples matched the recording exactly, and late ones drifted (8
  copies live against 7 recorded). The live option says so.
- tfjs's ESM build doesn't load in plain Node, so Node scripts import only
  the corpus helpers. Unit tests run the model on the CPU backend under
  Vitest.
