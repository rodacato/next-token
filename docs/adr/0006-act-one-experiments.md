# 6. Act I experiments: lost in the middle and fabricated references

Date: 2026-10-16 · Status: accepted

## Context

Chapters 3 and 4 need real measurements from the in-browser model, not
illustrations. Both are recorded with `npm run record:experiments` (Qwen2.5-0.5B,
q8, WebGPU) and can be re-run live once the learner loads the model.

## Decision

**Lost in the middle (chapter 3).** One note ("the courier for order 4471
is Ramiro") is placed at nine depths among 30 others. We read the
probability of the first sort of the answer, " Ram", over the whole
vocabulary. The question ends by repeating the note's wording ("…the
courier for order 4471 is named"). In Spanish, more natural phrasings ("se
llama", "El nombre del repartidor es") led this model to predict " el" or
" a" instead of a name, which would have measured the phrasing, not the
retrieval.

Results on 2026-10-16:
- **English:** a U-shape: 65–71% near the start, 6–15% through the middle,
  58% at the end.
- **Spanish:** strongest at the start (72%), 2–4% in places in the middle,
  2% at the end.

The chart shows both languages for every learner.

**Fabricated references (chapter 4).** The compositor continues a
bibliography that starts with two real 2023 papers. Three choices shaped the
recording:
- **One line per entry.** The shop sets each entry number; the model writes
  one line and stops at a newline or `<|endoftext|>`. Left free, a 0.5B base
  model drifts into noise or loops within a few entries.
- **Seeded sampling** at temperature 0.8, top-p 0.92 and a 1.1 repetition
  penalty, scoped to each line. Greedy decoding repeated one line
  indefinitely, which teaches degeneration, not fabrication.
- **Seed 2, chosen after trying seeds 1 to 3.** It is the run where both
  languages wrote three complete entries. This is a selection, and it is
  disclosed here and in the recording's own settings, which are shown on
  screen.

Each entry is checked against Semantic Scholar's title match. A truncated
real title counts as found. Authors and venues are not checked, and the
chapter says so; the Spanish run has a real title with invented authors.

## Consequences

- These are single runs of a 0.5B model, and the chapter says so. The
  numbers show this model's behavior, not a law.
- Semantic Scholar's unauthenticated API rate-limits heavily. Raw model
  output is saved first, and `--check-only` re-runs only the lookups.
- Measuring exposed that the q4f16 WebGPU weights were broken for writing;
  see ADR 2.
