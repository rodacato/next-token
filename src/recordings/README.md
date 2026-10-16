# Recordings

Real model outputs the course replays when nothing runs live: the learner has
not loaded the in-browser model, has no key, or Dojo does not grant `llm`.
Every recording carries its model and date, and the course shows both on
screen.

All of them live here, and each kind has one command to refresh it.

| Folder | What | Refresh with | Runs on |
| --- | --- | --- | --- |
| `next-token/<locale>.json` | Next-token logits for chapter 2's line and two levels of likely continuations | `npm run dev`, then `npm run record:runs` | The in-browser model (Qwen2.5-0.5B) in headless Chromium. Free. |
| `llm/<recipe>.json` | Claude answers for duels, evals and demos | `npm run record:llm -- <recipe>` | Your Claude subscription, through the Claude Code CLI (`claude -p`). No API key. |
| `llm/recipes/<recipe>.json` | What to ask: model, system prompt, prompt per locale, repeats, optional JSON Schema | Edit by hand | — |

## Refreshing an LLM recording

```bash
npm run record:llm -- fabricated-citations --dry-run
```

```bash
npm run record:llm -- fabricated-citations
```

The dry run prints how many calls it would make. The real run overwrites
`llm/<recipe>.json` with today's date. Review the diff before committing: a
new model version can change answers, and that is often the lesson.

## What the recordings say about themselves

- `model`: the exact model id the CLI reports, for example
  `claude-haiku-5-5`.
- `recordedAt`: the date of the run.
- `temperature: "provider-default"`: the CLI does not expose temperature, so
  recipes that need a specific temperature must run on an API key (Step 2
  plan, LLM port).
- `usage` and `listCostUsd`: token counts and the list-price equivalent. On a
  subscription this is not what you pay. Input tokens include a fixed CLI
  overhead of about 1.25k cached tokens, so the course computes the cost it
  shows learners from the prompt and the dated price table, not from this
  field.
