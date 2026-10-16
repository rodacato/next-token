# 4. Recordings live in one folder; Claude recordings use the subscription

Date: 2026-10-16 · Status: accepted

## Context

Duels, evals and several demos need real model outputs that the course can
replay without a key. The owner wants them made with their Claude
subscription and easy to refresh.

## Decision

- Every recording lives under `src/recordings/`, documented in its README:
  `next-token/` for in-browser logits and `llm/` for Claude answers.
  `llm/recipes/` holds what to ask.
- `npm run record:llm -- <recipe>` calls `claude -p` with:
  - `--system-prompt`, which replaces Claude Code's own prompt
  - `--tools ""` and `--safe-mode`, so there are no tools, hooks or
    CLAUDE.md
  - `--no-session-persistence` and `--output-format json`
  - an optional `--json-schema`

  It runs from a temporary directory, so the call carries no project
  context.
- Each recording stores the reported model id, the date, the output, token
  usage and the list-price equivalent.

## Consequences

- No API key is needed to record. The cost is subscription usage, not money
  per call.
- Temperature cannot be set through the CLI, so recordings are marked
  `temperature: "provider-default"`. A chapter that compares temperatures on
  Claude needs an API key through the LLM port instead.
- Reported input tokens include a fixed CLI overhead (about 1.25k cached
  tokens). The costs shown to learners come from the prompt and the dated
  price table, never from this field.
- First run (`fabricated-citations`, Haiku 5.5): the model hedged instead of
  fabricating. It named real papers, marked DOIs "from memory" and refused
  to invent a third. Chapter 4 will therefore get its fabrications from the
  small in-browser model and show the larger model's hedging as the
  contrast.
