# Phase A · Act I complete, Dojo bridge

| Capture | What it shows |
| --- | --- |
| `ch3-overflow-{en,es}.png` | The stick at 96 sorts; 57 have fallen off and the refund rule went with them |
| `ch3-clamped-{en,es}.png` | Same conversation with the system message clamped: the rule survives, the order number doesn't |
| `ch3-needle-{en,es}.png` | Lost in the middle, measured on Qwen2.5-0.5B in both languages, after a prediction |
| `ch4-written-{en,es}.png` | Invented references, ink density = confidence, shop-set numbers in brass |
| `ch4-checked-{en,es}.png` | Marks first, then the catalog: 3 of 3 English references don't exist; the larger model's hedged answer below |
| `ch2-phone-fan-en.png` | The compact fan at 390 px |

## Shipped

- **Dojo scroll protocol v0:** `HostBridge` (standalone and embedded),
  generated `scroll.json`, and Dojo's conformance suite in CI. Locally: 16
  rules pass, 0 fail, 2 skipped because they cover code execution (`run`).
- **Chapter 3, the composing stick:** three shop rules for a full stick, a
  facts slip, and the lost-in-the-middle measurement.
- **Chapter 4, fluent is not true:** sampled references with per-sort
  confidence, a mark-then-check flow, and the larger model as contrast.
- **Press sound** (synthesized, off by default), the compact fan on phones
  and a readable NEXT label.
- **Fixed:** q4f16 weights on WebGPU degenerated when writing; every device
  now uses q8 (ADR 2).

## Self-critique

What works:
- Both measurements are real and surprising in the right way. English shows
  a U-shape. Invented references average 55% confidence; one Spanish entry
  is a real title with invented authors.
- Every number on screen carries its model, date and settings.

Still open:
1. Live mode exists for the needle chart ("Run it yourself") but not for
   chapter 4's writing. Writing 3 entries live re-reads the whole context per
   sort; it needs a KV cache in the worker first.
2. The ticket in the masthead wraps to two lines at 1440 px with four
   chapters; it needs a denser layout before Act II adds more.
3. The phone fan is legible but leaves empty space below it.
4. Reference checks verify titles, not authors; the chapter says so.
