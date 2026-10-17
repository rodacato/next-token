# Phase B · Act II: the LLM port, evals, and chapters 5 to 10

Every screen runs on recorded Claude Haiku 5.5 answers (2026-10-16), with the
model and date shown on screen. With a key in Outside work, the same benches
run live and show the cost first.

The captures aren't kept in the repo. Regenerate them into this folder
against a running dev server:

```bash
APP_URL=http://localhost:5317 node scripts/capture-phase-b.ts
```

| Capture | What it shows |
| --- | --- |
| `ch5-tickets-en.png`, `ch5-duel-en.png` | The prompt duel: the lovely prompt reads better and scores 0 of 10 on the format |
| `ch6-eval-en.png` | The eval builder with the LLM judge and how often it agrees with the rules |
| `ch7-press-{en,es}.png` | Asked nicely: sheets rejected for a Markdown fence, then accepted after one retry |
| `ch8-docket-{en,es}.png` | The learner as executor: a wrong row handed back, the model looks again, the refund refused |
| `ch9-case-{en,es}.png` | The handbook cut every 160 characters, ranked by cosine similarity; the answer contradicts the handbook |
| `ch9-grid-{en,es}.png` | Three cuts × three questions: only section cuts answer all three |
| `ch10-ask-{en,es}.png` | The harness diagram mid-run: the gate asks the person to approve 2,450 MXN |
| `ch10-night-{en,es}.png` | Approved twice without notes: 4,900 MXN out for one blender |

## Shipped

- **LLM port and CostGuard:** the Anthropic, OpenAI, OpenAI-compatible,
  Dojo host and recorded adapters, plus a session budget priced from a dated
  table. Keys stay in the browser (session, or local storage if "remember"
  is ticked).
- **Eval runner and graders:** exact, regex, max words, mentions,
  negation-aware facts, JSON Schema, and an LLM judge that code reads first.
- **Chapters 5–10:** prompt duel, eval builder, structured output, tools,
  retrieval, agents. Each has a prediction before the measurement and real
  recorded runs in both languages.
- **Chapter 9** runs multilingual-e5-small in the worker on demand
  (135 MB). By default it uses recorded vectors and downloads nothing.
- **Chapter 10** runs an XState loop against a real MCP server over the
  in-memory transport. The recipe generator runs the same harness in Node to
  find every branch to record.
- **ADR 7:** the port, recorded trees, JSON judges, and the findings.

## Self-critique

What works:
- The findings come from the model, not the script. The double refund, the
  dropped electronics rule and the fenced JSON all showed up in the
  recordings, in both languages.
- The harness diagram greys out the parts you switched off, so the missing
  notes are visible before the till shows it.
- Fixing the Spanish judge meant applying chapter 7's lesson (a schema,
  quote first) to the course's own tooling.

Still open:
1. The main bundle is 3 MB (811 kB gzipped). Recordings are loaded eagerly,
   and the SDKs, CodeMirror and React Flow share one chunk. Chapters and
   recordings should load lazily.
2. Live runs in chapters 8 and 10 use the JSON turn protocol, not native
   `tool_use`. The bench says so; native tool use for live keys is not wired.
3. The sub-agent saves little here, because the order record is barely
   longer than its summary (about 97 tokens). A bigger record would make the
   trade-off visible.
4. Your own question in chapter 9 (live embedder) is answered but not
   judged, because there is no answer key for it.
5. One English branch in chapter 8 replies in Spanish after two lookups.
   It's kept as recorded, and the bench doesn't point it out.
6. Recorded input tokens are estimated (characters ÷ 4), because the CLI
   reports cache instead. Live runs show the provider's counts.
7. The masthead ticket fits 10 chapters at 1440 px. Narrower desktop widths
   were not checked in this phase.
