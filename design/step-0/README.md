# Step 0 · Visual direction

One moment, drawn three ways: *Every morning the baker opens the ___*. The
probability fan is open, and temperature and top-p are live on every board.
Probabilities are placeholders shaped like a small model's output; Step 1
replaces them with real logits.

| Board | File | Captures |
| --- | --- | --- |
| A · The Composing Room | `a-composing-room.html` | `captures/a-composing-room{-cold,,-hot}.png` |
| B · The Specimen Sheet | `b-specimen.html` | `captures/b-specimen{-cold,,-hot}.png` |
| C · The Locked Forme | `c-forme.html` | `captures/c-forme{-cold,,-hot}.png` |
| Prototype (A, 10 s) | `prototype.html` | `captures/prototype.webm`, `captures/prototype-*.png` |

Each board is captured at T = 0.2, 0.8 and 1.6. The fan's width comes from
perplexity, so it closes almost completely when the model is sure.

Run `npm run boards`, then `npm run boards:capture` to regenerate the captures.

## Recommendation

**Build A's bench, and use B's typography for the moments that need to be
seen from across a room.**

- **A** is the only direction that holds the whole course. The case, stick,
  press and proof are separate props, so chapters can rearrange the bench, as
  the brief asks. It also gives every wow moment a physical home: the stick
  overflows, the press rejects a sheet, the foundry swaps in for the case.
- **B** has the strongest single image. A fan of words set in Bodoni, sized by
  probability, reads instantly in a recording. It doesn't extend into a
  layout system, though: every chapter would turn into a poster.
- **C** has the best teaching detail: type locked into the forme backwards,
  with the proof reading right. But the dark ground goes against the cream-paper
  brief and pulls toward neon-on-black. Keep the mirrored forme as the press
  close-up in chapter 7 ("the press rejects a malformed sheet").

## Self-critique against the brief

- The fan is on screen at 2.9 s in the prototype, inside the 5-second budget.
- Only the five hues appear. Tints are mixes of those hues, and there are no
  gradients, glow or blur.
- Only two typefaces are used: Bodoni Moda and IBM Plex Mono.
- There are no cards, chat bubbles, sparkles or confetti, and no
  "Correct!"/"Wrong!" feedback.
- Motion: falls accelerate and seat with a 3.5% compression; the press drops,
  jolts 2 px and lifts. Nothing overshoots. With `prefers-reduced-motion`, the
  final states appear without travel.
- Weak spots to fix in Step 1:
  - A's metal sorts are dark rectangles with text. They need a nick, a visible
    body and a less noisy face texture.
  - The ink filter is tuned for 27 px. At B's 104 px it looks speckled rather
    than inked.
  - After the press lifts in the prototype, the bench is empty for 1.5 s.
  - The impression on the proof is small; it should be the loudest type on the
    bench.
  - The token ids in B are illustrative. Real ones come from the tokenizer.
  - All three boards use a fixed 1600 × 1000 canvas. They are not responsive
    yet.
