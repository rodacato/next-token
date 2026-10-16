# 5. Integrate with Dojo through scroll protocol v0

Date: 2026-10-16 · Status: accepted

## Context

The course must run standalone and as an iframe in Dojo, following the
contract shared with Pattern Circuit, It Depends and 3 AM. Dojo publishes
that contract as scroll protocol v0 (`docs/scrolls/PROTOCOL.md` in the Dojo
repository), with a conformance suite. There is no shared npm package.
It Depends implements the protocol with a `HostBridge` port (its ADR 4).

## Decision

- The same shape as It Depends: a `HostBridge` port with **standalone**
  (the default, silent) and **embedded** adapters.
- The embedded adapter activates only when the page is framed and has
  `?host=<origin>`. It runs the nonce handshake, checks both origin and
  source, validates every host message with Zod and falls back to
  standalone after 3 s.
- Units are chapters:
  - opening one sends `progress {completed: false}`
  - reaching its debrief sends `progress {completed: true, state}` and then
    `complete {unitId}`
  - finishing every chapter sends `complete {}`
  - height changes send `resize`
  - the host's `init.locale` and `setLocale` drive the language, and its
    `init.progress` marks chapters done
- `public/scroll.json` is generated from content (`npm run manifest`, run
  before every build). A test fails if the committed manifest is stale.
- The LLM completion and the finale's evaluation use a **proposed**
  `llm {id, task, input}` → `llmResult {id, task, output}` pair, with
  `task` set to `complete` or `evaluate-submission`. It is aligned with It
  Depends' proposal and sent only if a host grants `llm`. Dojo reserves that
  capability and grants it nowhere today.
- The host theme is accepted and ignored for now. The print-shop palette is
  a brief constraint (Step 2 plan, open question 3).
- CI checks out `rodacato/dojo`, builds `@dojo/scroll-conformance` and runs
  it against the production build with `tests/conformance/drive.mjs`, which
  completes chapter 1.

## Consequences

- First local run, 2026-10-16: 16 rules pass, 0 fail, and 2 are skipped
  (`run-granted`, `run-language`), because the course does not ask the host
  to run code.
- Progress sent to Dojo is self-reported and never feeds belts, as the
  protocol states.
