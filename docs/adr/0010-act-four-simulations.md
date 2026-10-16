# 10. Act IV: seeded simulations with their assumptions on the page

Date: 2026-10-16 · Status: accepted

## Context

Act IV is about shipping: whether a feature should use AI, how the
interface handles wrong answers, the bill, the launch and a final design
review. None of it can run on real Mercadito traffic, so the brief asks for
deterministic simulations with delayed consequences.

## Decision

- **Pure functions in `src/sim/`.** Each simulation (features, failure,
  bill, launch, injection, review) has unit tests and no UI.
- **Common random numbers.** Each request or conversation gets its own seed
  (`seedFor(seed, id, i)`). A design change alters outcomes only through its
  mechanism, never by reshuffling luck, and the same plan replays the same
  month.
- **Every number is in content, with its provenance.** Each value is either:
  - measured earlier in the course, naming the chapter (chapter 5's 7 of 10,
    chapter 6's 4 of 6, chapter 9's 12 right, 2 wrong and 4 unsure of 18);
  - a dated price: list prices, plus cache prices checked on the pricing
    page on 2026-10-16;
  - an assumption, labelled as one on screen.
- **Costs from chapter 20 feed chapter 21.** The launch takes its cost per
  conversation from chapter 20's content and the price table at runtime,
  not from copied numbers.
- **The injection lab is a matrix, not a model.** Each defence either
  blocks an attack or weakens it, which halves its success. Prompt-level
  defences (marking text as data, a system rule) only weaken. Architecture
  blocks: the refund gate, an agent without tools for untrusted text, an
  output filter, keeping no secrets in the prompt. This follows OWASP LLM01,
  Greshake et al. 2023 and the "lethal trifecta" argument; the chapter says
  it's a model of the idea, not a measurement.
- **The finale is graded by a deterministic rubric.** It has 20 checks,
  each tied to an earlier chapter, with language-aware keywords. A Dojo host
  could later offer the proposed `evaluate-submission` message; it isn't
  used yet. Nothing is graded before submission.

## Findings the simulations produce (with the shipped assumptions)

- **Chapter 18.** An LLM everywhere costs 1.34M MXN a month; the cheapest
  plan, about 147k, uses an LLM for gift search only. The API is the
  smallest line in every plan.
- **Chapter 19.** Honest refusal alone cuts harm from 155 to 79 per 1,000
  conversations, at 149 hand-offs. Streaming alone raises harm to 220: fewer
  people leave, so more read wrong answers.
- **Chapter 20.** $3,744 a month on Sonnet 5.5 without caching. Routing 75%
  to Haiku 5.5 plus caching (90% hit rate, assumed) brings it to about $600,
  84% less.
- **Chapter 21.** Launching with nothing switched on costs 1.82M MXN over
  eight weeks; the injection week alone is about 1M. A staged, capped,
  grounded, checked plan with architectural defences costs about 67k.

## Consequences

- The conclusions depend on the assumptions. The chapters show them, and
  changing one in content changes the result. That's the point, and also
  the limit.
- No new recordings: Act IV runs entirely offline and replays identically.
