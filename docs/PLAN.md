# Next Token · Step 2 plan

Date: 2026-10-16. Step 1 (Act I, chapters 1 and 2) is built and approved.
This plan covers everything after it. There are no approval gates from here
on: each phase ends with screenshots, a recorded walkthrough and a written
self-critique in `design/phase-*/`.

## 1. Content schema (Zod 4, `src/content/`)

Entities have stable English ids. Every visible string lives in
`src/i18n/locales/*.json` under `chapters.<id>.*`, `duels.<id>.*` and so on.
Language-bound specimen data (prompts, corpora, cases) is keyed by locale
inside the content file. Adding a chapter means adding a JSON file whose
`kind` names an existing engine.

| Entity | Shape (abridged) |
| --- | --- |
| Chapter | `id, act, number, kind, readNext[]` plus kind-specific fields (`tokens`, `next-token`, `stick`, `fabrication`, `duel`, `eval-builder`, `structured`, `tools`, `rag`, `agent`, `trainer`, `checkpoints`, …) |
| Eval set | `id, cases[{id, input{locale}, expected?, tags[]}], graders[]` |
| Grader | `exact` · `regex` · `json-schema` (a Zod schema id) · `rubric{criteria[]}` · `llm-judge{rubricId, judgeModel}` |
| Duel | `id, task, evalSetId, contenders{a,b}: {system{locale}, prompt{locale}}`. The "obviously better" contender is marked only in the debrief, never on screen. |
| Recorded run | `id, kind(llm\|agent\|next-token\|checkpoint), provider, model, recordedAt, params{temperature, maxTokens, …}, requestHash, outputs[], usage{input, output}, costUsd` |
| Commission | `id, seed, brief, decisions[{id, options[{id, effects}]}], consequences[{week, when, event}]` |
| Injection lab | `attacks[{id, payload{locale}, vector}]`, `defenses[{id, blocks[]}]` |
| Price table | `model, inputPerMTok, outputPerMTok, source, asOf`. Shown with its date and never hard-coded in an engine. |

Every recorded run shows "Recorded run · {model} · {date}" on screen. A
content test fails if any of these keys is missing in any locale.

## 2. LLM port and adapters (`src/llm/`)

```ts
type LlmPort = {
  id: "host" | "anthropic" | "openai" | "openai-compatible" | "recorded";
  estimate(req: CompletionRequest): CostEstimate; // shown before every live run
  complete(req: CompletionRequest, signal?: AbortSignal): Promise<Completion>;
};
```

- `CompletionRequest` carries `messages, system, temperature, maxTokens` and
  an optional `schema`. The schema is a Zod 4 schema exported to JSON
  Schema, and the response is validated against it.
- **host**: sends `llm {task: "complete"}` through the HostBridge. It is only
  used when Dojo grants `llm`, which it does not do yet.
- **anthropic**: BYOK, with the browser-access header enabled explicitly.
- **openai**: BYOK.
- **openai-compatible**: BYOK with a base URL.
- **recorded**: looks runs up by `requestHash`. It is the default whenever
  no other adapter is available.
- Keys live in `sessionStorage` unless the learner ticks "remember on this
  device", which moves them to `localStorage`. The warning says the key never
  leaves the browser except to that provider.
- A `CostGuard` wraps every live adapter. It shows the estimate first, adds
  up spend for the session and refuses past the cap (default $1.00,
  editable). Model ids and prices come from the price table and are checked
  against provider docs when the adapters are written.

## 3. Worker messages

- **Inference worker** (`src/model/`). It exists today with `load-tokenizer`,
  `load-model`, `tokenize` and `next-token`. Phase B adds `load-embedder` and
  `embed {texts[]} → vectors`, using a small multilingual embedding model
  (size and license verified in an ADR). Cosine similarity stays on the main
  thread, visible in code.
- **Trainer worker** (`src/trainer/`):
  - `init {corpus, config, seed}`
  - `train {steps}` streams `loss {step, train, val}` and `sample {step, text}`
  - `sample {prompt, temperature}`
  - `save` and `restore`, with checkpoints stored in IndexedDB
  - `stop`

  Backend: TensorFlow.js with the WebGPU backend, falling back to WebGL and
  then WASM, because it brings autograd. The decision goes in an ADR in
  phase C, with a fallback to a hand-written model if its WebGPU backend
  falls short.

## 4. Course manifest and HostBridge (`src/host/`) on Dojo scroll protocol v0

`scroll.json` is generated from content by `scripts/build-manifest.ts`:
id `next-token`, `version` from package.json, `protocol: 0`,
`entry: "index.html"`, `locales: ["en", "es-MX"]`, titles and descriptions
per locale, `programmingLanguages: []`, `units` = the 22 chapter ids, and
`capabilities: ["progress", "llm"]`.

The `HostBridge` port has two adapters, matching It Depends' ADR 4:

- **Standalone** (the default) sends nothing and keeps progress in
  `localStorage`, as it does today.
- **Embedded** activates only when framed with `?host=<origin>`. It answers
  the nonce handshake, checks both origin and source, and falls back to
  standalone after 3 s.

| Brief message | Protocol v0 |
| --- | --- |
| Handshake and initial config (locale, theme, earlier progress) | `hello` → `init` |
| Unit started | `progress {unitId, completed: false, state: {stage}}` (state capped at 64 KiB) |
| Unit completed | `progress {completed: true}` then `complete {unitId}` |
| Course completed | `complete {}` |
| Locale or theme changed | `setLocale` / `setTheme` |
| Content height | `resize {height}` |
| LLM completion | **Proposed** `llm {id, task: "complete", input}` → `llmResult {id, output}` |
| Evaluate submission (finale) | **Proposed** `llm {task: "evaluate-submission"}` → `llmResult` |

The two `llm` rows are not in v0: Dojo reserves the `llm` capability and
never grants it. The course sends them only if a host grants `llm`.
Otherwise it uses the learner's own key or recorded runs, and the finale
falls back to its deterministic rubric. CI runs Dojo's scroll conformance
suite against the build, with a `--drive` module that completes a unit.

## 5. Folder structure

```
src/model    inference worker, tokenizers, sampling, recordings
src/trainer  training worker and the char-level model
src/llm      LlmPort, adapters, CostGuard, recorded runs
src/evals    runner, graders, result table (reused in Act III)
src/agents   XState loop, MCP client/server (in-memory transport), traces
src/sim      seeded PRNG, Act IV simulations, injection lab
src/content  schemas, chapters, eval sets, duels, commissions, sources
src/i18n     catalog, provider, locales/*.json
src/host     course state, HostBridge, manifest
src/ui       shell, props (sorts, stick, press, fan…), one folder per chapter kind
scripts/     i18n check, manifest, record runs, captures
docs/adr/    one ADR per decision
```

## 6. Phases

| Phase | Scope | Done when |
| --- | --- | --- |
| **A · Act I + host** | Chapters 3–4: the stick overflows and a sort falls off the end, lost-in-the-middle, a fabricated-citation catcher. HostBridge, manifest, conformance suite in CI. Mobile fan geometry, press-sound toggle (off by default), NEXT label. | Act I playable in both locales, embedded and standalone |
| **B · Act II** | LLM port and adapters, CostGuard, eval runner and graders, CodeMirror 6 editors, chapters 5–10. The duel the "better" prompt loses. Structured output with retries and the press rejecting a sheet. The learner as tool executor. RAG with visible chunks and cosine. XState agent loop, a real MCP exchange, React Flow harness diagrams, the blocked action. | Every duel and eval works on recorded runs with no key |
| **C · Act III** | Trainer worker; chapter 11 trains live on Mexican proverbs. MiniCPM5 checkpoint comparisons, recorded after verifying the licenses of its weights and datasets. Chapters 12–17, with chapter 17 reusing the Act II runner, including what got worse. | Loss curve and samples move from noise to style in about two minutes on a laptop |
| **D · Act IV** | Seeded Mercadito simulations: chapter 18 (rules, search or LLM), 19 (designing for failure), 20 (the bill), 21 (the launch, with the injection lab), 22 (finale and review board). | Deterministic replays; the launch's cost chart takes off |
| **E · next-token-foundry** | Companion repo: QLoRA on MiniCPM5-2B on a ~12 GB GPU, the chapter 14 dataset, the course's eval sets, GGUF export, Ollama. TRL + PEFT vs Unsloth decided in its first ADR. | One documented run, start to finish, on consumer hardware |

## 7. Decisions I need from you

1. ~~**Recorded LLM runs cost real API calls.**~~ Decided on 2026-10-16:
   recordings run on your Claude subscription through the Claude Code CLI
   (`npm run record:llm -- <recipe>`) and live in `src/recordings/`. See ADR 4.
2. **The `llm` extension.** Should I align its shape with It Depends'
   proposal (`llm` / `llmResult` with a `task` field) and write it up as one
   proposal for Dojo's protocol?
3. **Host theme.** The print-shop palette is a brief constraint. My plan is
   to read `init.theme` only for light or dark, and later offer an "inked
   forme" dark variant (direction C) instead of adopting Dojo's colours. Does
   that work for you?

## 8. Phase C plan (Act III, written 2026-10-16)

Verified before planning:
- **MiniCPM5-2B** ships four checkpoints, all Apache-2.0, plain
  `LlamaForCausalLM`: Base (pretraining only), Midtrain, SFT, and the
  release (RL + on-policy distillation). Its datasets (Ultra-FineWeb,
  UltraX, UltraData-SFT/RL) are Apache-2.0 too, English and Chinese only.
- **TF.js** last shipped 4.22.0 in January 2025. It still brings autograd
  and a WebGPU backend; ADR 8 records the risk and the fallback.
- **Recording machine:** M2 Max, 32 GB. MiniCPM5 runs through mlx-lm (via
  `uv`), so recordings say "mlx-lm, bf16, M2 Max" instead of the Claude CLI.

| Ch | Bench | Real data behind it |
| --- | --- | --- |
| 11 Casting from scratch | Trainer worker: a tiny char-level transformer learns proverbs live; loss curves (train/val), samples per step, a memorization marker; a small corpus overfits | Live training (TF.js, seeded); recorded curves and samples for machines without a GPU |
| 12 Stages of a real model | The same prompts through Base → Midtrain → SFT → release; the learner sorts unlabeled answers by stage before the reveal | MiniCPM5-2B, four checkpoints, recorded with mlx-lm |
| 13 Kinds of training | Match each method to the data it needs, what it changes and what it can't do; MiniCPM5's own pipeline as the worked example | Sources: InstructGPT, DPO, Tülu 3 (RLVR), distillation, the MiniCPM5 card |
| 14 The data workshop | A Mercadito fine-tuning set with planted contradictions, duplicates, bad answers and eval leakage; flag first, then run the checks | Exact and near duplicates (recorded e5 vectors), n-gram leakage against the Act II eval sets |
| 15 The LoRA plate | W + BA with a rank slider; parameter and memory counts for MiniCPM5-2B's real shapes; a LoRA adapter on chapter 11's model, switchable on and off | Live adapter training in the trainer worker on a shipped base checkpoint |
| 16 Train or not | Cases: prompt, RAG, fine-tune or distill; facts versus behaviour | A LoRA fine-tune of MiniCPM5-2B on chapter 14's cleaned set (mlx-lm), probed for a taught fact and a taught behaviour |
| 17 Before and after | The Act II runner on the base and fine-tuned model, including what got worse | Same fine-tune; graders and a recorded Claude judge |

The fine-tune in 16–17 is a small local LoRA run for the course; the
QLoRA-on-a-12-GB-GPU recipe stays in phase E (next-token-foundry).
