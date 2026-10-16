# Step 1 · Vertical slice

Act I, chapters 1 and 2, in English and Spanish (Mexico). The captures come
from `scripts/capture-step1.ts` against the dev server, using the recorded
compositor.

| Capture | What it shows |
| --- | --- |
| `ch1-bench-{en,es}.png` | Copy set by o200k_base; "Mañana" splits into three sorts |
| `ch1-measure-{en,es}.png` | Predict first, then the paired copy: Spanish costs 1.22× the sorts on o200k_base |
| `ch2-fan-{en,es}.png` | The typographic fan at T = 0.8, with real Qwen2.5-0.5B logits (recorded run) |
| `ch2-fan-cold-*.png`, `ch2-fan-hot-*.png` | The same line at T = 0.15 (one sort, 100%) and T = 1.6 (scalding) |
| `ch2-mobile-en.png` | The bench stacked at 390 px |
| `walkthrough-en.webm` | Temperature sweep, a pick by hand, a draw, the press, then chapter 1 typing |

## What is real

- **Tokenization**: o200k_base through js-tiktoken, and Qwen2.5's own
  tokenizer (7 MB, fetched on request) in the worker.
- **Logits**: Qwen2.5-0.5B through Transformers.js in a worker, WebGPU when
  the adapter has `shader-f16`, WASM q8 otherwise. The recorded runs were
  made with this same worker on 2026-10-16 (WASM q8) and are labeled on
  screen. In Spanish, the fan after "abre la" really is word pieces (" ti",
  " cu", " pu"), so the bench explains it.
- **Measurements**: the token counts and the cost slip are computed live. The
  twenty draws use a seed, so they replay exactly.

## Self-critique against the brief

Fixed during this step:
- The fan was below the fold, behind a gap the right column stretched open.
  The bench was re-laid out so that the copy, stick, fan, press, proof and
  temperature fit in 1440×900.
- The first WebGPU run crashed on an adapter without `shader-f16`. Detection
  now falls back to WASM q8.
- A closed fan left a grey smudge of near-zero sorts behind the top word.
  Blades now fade with their probability.
- When the stick wrapped, the fan spilled into the copy column. The pivot is
  now clamped inside the fan box.
- The press lever overflowed on narrow screens.

- The live path was verified in the app (`ch2-live-en.png`): opt in, load
  the model from cache, then type a new line, "The compositor picks the".
  The fan comes back live in 263 ms on WASM. The same check exposed a
  lone-space sort with an empty label; it now shows as "␣".

Still open, in priority order:
1. The download progress bar has only been seen with cached weights, not
   during a cold 512 MB download.
2. On a phone, the fan is legible but small. It needs its own geometry
   below 760 px.
3. Recorded runs cover the default line plus two levels of likely
   continuations. Picking an unlikely sort leads to the honest "No
   recording for this line" state; only the live model goes further.
4. The NEXT label sits on the stick's rail edge and is hard to read.
5. The optional press sound toggle is not built.
6. The course manifest and the HostBridge are deferred to the Step 2 plan.
   Progress already goes through a `ProgressStore` port.
