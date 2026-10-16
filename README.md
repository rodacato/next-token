# Next Token

[![CI · Test](https://github.com/rodacato/next-token/actions/workflows/ci.yml/badge.svg)](https://github.com/rodacato/next-token/actions/workflows/ci.yml)
[![Site · Pages](https://github.com/rodacato/next-token/actions/workflows/site-pages.yml/badge.svg)](https://github.com/rodacato/next-token/actions/workflows/site-pages.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Play it in your browser: [rodacato.github.io/next-token](https://rodacato.github.io/next-token/)**

An interactive course on large language models, from the inside out, set in a
letterpress print shop where every token is set by hand.

**Status: Step 1, vertical slice.** Act I, chapters 1 and 2, in English and
Spanish (Mexico):

1. **Sorts** (tokens): type copy and watch two real tokenizers break it into
   sorts (o200k_base through js-tiktoken, and Qwen2.5's own tokenizer in a
   worker). Then measure what the same message costs in Spanish.
2. **The next sort** (next-token prediction): the probability fan with real
   logits from Qwen2.5-0.5B running in your browser. Change temperature and
   top-p, pick by hand or let the compositor draw, and measure twenty draws
   cold and hot.

The design direction is in [`design/step-0/`](design/step-0/), and decisions
are in [`docs/adr/`](docs/adr/).

## Run it

```bash
npm install
npm run dev
```

Everything runs in the browser. Before you opt in to the model download, the
fan replays recorded runs of the same model, labeled with model and date.

## Checks

```bash
npm run check
npm run test:e2e:smoke
npm run test:e2e
```

`check` runs the typecheck, lint, unit tests and the i18n key check. The
end-to-end tests run against recorded runs, so they need no model download.
Pull requests run the `@smoke` test; the full suite runs nightly and on demand.

## Recording runs

```bash
npm run record:runs
```

This needs `npm run dev` running. It drives the real model in headless
Chromium and writes `src/model/recordings/next-token.<locale>.json`.

## License

MIT. Model weights are downloaded from Hugging Face under their own licenses
(Apache-2.0 for both models offered; see ADR 2).
