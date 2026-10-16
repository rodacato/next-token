# Phase D · Act IV: commissions, chapters 18 to 22

Seeded simulations: the same plan replays the same weeks. Every number is
on the page, as a measurement from an earlier chapter, a dated price or an
assumption.

| Capture | What it shows |
| --- | --- |
| `ch18-month-{en,es}.png` | An LLM for every feature: 1.34M MXN in a month, almost all of it wrong answers; the API costs 511 MXN |
| `ch19-design-{en,es}.png` | Uncertainty and confirmation switched on: the preview shows the same wrong answer under that design, and the ledger counts the harm |
| `ch20-bill-{en,es}.png` | Routing to Haiku 5.5 and caching: from $3,744 to about $600 a month, by component |
| `ch21-launch-{en,es}.png` | Launching bare: the sale triples API spend in week 3, and the bills for invented policies and injections land a week later |
| `ch22-board-{en,es}.png` | A thin submission in front of the review board: every member requests changes, each comment pointing at an earlier chapter |

## Shipped

- **Simulation core** (`src/sim/`): pure, seeded and unit-tested functions
  for features, failure, the bill, the launch, the injection matrix and the
  review rubric.
- **The price table** gains cache write and read prices, checked against
  the pricing page on 2026-10-16.
- **Chapters 18–22**, each with a prediction before its measurement, in
  both languages. The finale reports course completion to Dojo through the
  existing bridge.
- **ADR 10:** simulations, provenance and the injection matrix.

## Self-critique

What works:
- The counterintuitive results come from the mechanisms, not the script:
  - streaming makes harm worse;
  - the API is the smallest line of the bill;
  - a system-prompt rule only weakens an injection.
- The act reuses earlier chapters' numbers (5, 6, 9, 20) instead of
  inventing new ones, and says where each came from.
- The launch chart now has two panels: incidents dwarf the API, so the API
  spike gets its own scale.

Still open:
1. Most of chapter 18's and 19's numbers are assumptions. They're labelled,
   but a learner can't edit them in the UI, only in content.
2. The injection lab is a hand-written matrix. A recorded run of real
   injections against Haiku with and without defences would make it
   evidence instead of a model.
3. Latency in chapter 20 is assumed per model, not measured.
4. The finale's rubric reads keywords. A thoughtful prompt written
   differently can fail a check, and a keyword-stuffed one can pass. A
   host-provided `evaluate-submission` would help; it isn't wired.
5. The masthead now carries 22 chapters on two rows at 1440 px. The denser
   design is proposed as its own session.
6. Chapter 21's week log is long; the weeks with nothing new could
   collapse.
