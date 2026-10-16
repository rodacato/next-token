# 9. Act III: MiniCPM5-2B recorded locally, and a real LoRA fine-tune

Date: 2026-10-16 · Status: accepted

## Context

Chapter 12 compares a real model's training stages. Chapters 16 and 17
need a real fine-tune to show what one learns and what it breaks. The
brief named MiniCPM5 and asked that its licences be checked first.

## Decision

- **Model and licences.** MiniCPM5-2B publishes four checkpoints:
  - Base, pretraining only;
  - Midtrain;
  - SFT;
  - the release, with RL and on-policy distillation.

  All four are Apache-2.0, `LlamaForCausalLM`, bf16, about 5 GB each.
  The datasets it cites (Ultra-FineWeb, UltraX, UltraData-SFT/RL) are
  Apache-2.0 too. Checked on the Hugging Face API, 2026-10-16.
- **Recording.** `scripts/record_minicpm.py` runs them through mlx-lm
  0.32.2 on an M2 Max (via `uv`). Every checkpoint gets the same bytes: the
  chat template with thinking off, greedy decoding, up to 400 tokens.
  Recordings say "mlx-lm, bf16, greedy" on screen; they are not Claude
  recordings.
- **The fine-tune.** mlx-lm LoRA on the release checkpoint:
  - **data:** chapter 14's 40 clean rows, chat format, prompt masked;
  - **adapter:** rank 8, scale 20, the last 16 layers, 0.19% of the
    weights (4.78 M);
  - **schedule:** 100 steps of 4 rows at 2e-5, about ten passes over the
    data, seed 0, 52–69 s.

  Both runs produced identical answers.
- **Evaluation.** Chapter 17 runs the Act II runner unchanged. A
  `tableAdapter` serves recorded answers by exact prompt behind the same
  `LlmPort`, so contenders, graders and the galley are reused as they are.

## Findings (2026-10-16)

- **Stages (chapter 12).**
  - The base checkpoint already answers like an assistant, and refuses the
    lock-picking request in English.
  - The release names Sydney ("Sídney") as Australia's capital in Spanish
    and mixes in English.
  - No stage completes "Camarón que se duerme" correctly; SFT and the
    release loop on it.
  - On 8 checks, Midtrain and SFT pass 7, Base 6 and the release 5.
- **Fine-tune (chapters 16–17).**
  - The sign-off went from 0 to 10 of 10 new support questions in English
    and 9 of 10 in Spanish.
  - Facts that appear in the training rows, asked in new words, stayed at
    1 of 5 in each language.
  - On general questions, English now names Melbourne as the capital and
    signs it "— The Mercadito team". Spanish lost the capital and the
    guacamole avocado.
  - Training loss fell from 2.56 to 0.002: the 40 rows were memorised.

## Consequences

- Re-recording needs the four checkpoints (about 20 GB) and Apple silicon.
  Phase E's companion repo will document the CUDA / QLoRA route.
- One model, greedy, one setting: chapter 12 says it's a look inside the
  pipeline, not a benchmark.
- mlx-lm's training log is a coloured table; the script strips colours to
  read the loss. Its "val" rows come from a subset of the training rows,
  so the course doesn't show them as held-out loss.
