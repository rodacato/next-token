# 7. Act II: the LLM port, recorded trees and judges that return JSON

Date: 2026-10-16 · Status: accepted

## Context

Chapters 5 to 10 need a real model's answers: prompt duels, evals with a
judge, structured output, tool calls, retrieval and an agent. Learners
without a key must get the same chapters, so every run is recorded with
Claude Haiku 5.5 on the owner's subscription (ADR 4) and replayed. A
learner with a key can run any bench live, and the cost is shown before the
run.

## Decision

**One port.** Every bench calls `LlmPort.complete`. The adapters are
Anthropic, OpenAI, OpenAI-compatible, the Dojo host (proposed `llm`
message) and recorded. A `SessionBudget` (default $1) prices each request
before it runs, from a dated price table. The recorded adapter finds a
completion by a hash of `{system, last user prompt, JSON Schema}`. The
recipe generator and the app build requests with the same functions, so a
byte difference shows up as "no recording", never as a wrong answer.

**Tools as constrained JSON, not native tool use.** In chapters 8 and 10 the
model writes each turn as a JSON object constrained by a schema (`call_tool`
with a tool and its inputs, or `reply`). The CLI can't send user-defined
tools, and one protocol keeps recorded and live runs identical. The bench
says so, and points to native tool use in the reading list. Live runs use
the same protocol on every provider with structured outputs; native
`tool_use` blocks are not wired.

**Trees, grown by running the real code.** Branching chapters are recorded
by running the actual tool protocol (chapter 8) or the XState harness
against the in-memory MCP server (chapter 10) over the recordings so far.
Every request they can't find becomes a recipe entry. `record:llm --extend`
records only those, and the cycle repeats until nothing is missing:
17 calls for chapter 8, 65 for chapter 10.

**Judges return JSON.** Free-text judges failed in two ways. The returns
judge called a plain "yes" a NO, so one-word replies are read by code first.
The Spanish retrieval judge opened with its verdict word and then argued
against it ("ACIERTA… NO"). It also confused the verdict CORRECTA with the
label "Respuesta correcta". The retrieval judge now returns
`{quote, verdict}` under a JSON Schema, quote first, with English verdict
values in both languages. After that its verdicts matched a manual read on
all 60 answers. The duel judges (chapters 5 and 6) stay free text, because
their disagreements are part of what chapter 6 teaches.

**Embeddings recorded in Node, live in the browser.** Chapter 9 ships the
multilingual-e5-small vectors (MIT, 118 MB q8 + 17 MB tokenizer) for every
chunk and preset question, about 160 kB of JSON, loaded lazily. Loading the
embedder runs the same weights in the worker on WASM. On 2026-10-16 browser
scores matched Node's to two decimals with identical rankings, so recorded
answers still matched in live mode.

## Findings (Claude Haiku 5.5, 2026-10-16)

- **Chapter 5 (returns duel):** the spec prompt gave exactly one correct
  word on 7/10 (en) and 6/10 (es). The lovely prompt managed 0/10 in both
  languages; its verdicts were right on 6/10 and 8/10, but buried in
  sentences.
- **Chapter 6 (mug copy):** every lovely description failed the length
  rule. The judge passed descriptions with invented claims, and flagged one
  ("hand-painted") the rules missed.
- **Chapter 7 (structured output):** asked nicely, 9 of 12 sheets came back
  in a Markdown fence. One retry with the validator's reason fixed all nine;
  constrained by schema, 12/12 parsed and were right.
- **Chapter 8 (tools):** handed the wrong order, the model noticed in both
  languages. In English it looked the order up again; in Spanish it asked
  the customer. In one English branch it replied in Spanish after two
  lookups. That recording is kept.
- **Chapter 9 (retrieval, 2 chunks):** section chunks answered all three
  questions right in both languages. 160-character chunks dropped the
  electronics rule and answered the headphones question wrong in English;
  sentence chunks did the same in Spanish. With nothing retrieved, the model
  said it didn't know, all six times.
- **Chapter 10 (agents):** without notes between tickets the agent refunded
  the same blender twice (4,900 MXN) in every configuration that lets
  refunds run, a person approving included. With notes, the second ticket
  got a reply and no refund. Blocking refunds over 2,000 MXN paid nothing.

## Consequences

- Editing content invalidates the matching recordings by hash; the bench
  says "no recording" until `npm run recipes` and `record:llm` run again.
- Trees must be extended, not re-recorded, or new first answers orphan
  their branches.
- Recorded runs show input tokens estimated from the request text, because
  the CLI's figures are mostly cache and include its own prompt.
