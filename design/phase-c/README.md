# Phase C · Act III: the foundry, chapters 11 to 17

Every screen runs on a recording by default, with its machine, tool and
date on screen. Chapters 11 and 15 also train live in the browser.

| Capture | What it shows |
| --- | --- |
| `ch11-live-en.png` | Training live on WebGPU: held-out loss turns up at step 250; by step 2,000, 7 of 12 samples are training lines copied whole |
| `ch11-recorded-{en,es}.png` | The same run, replayed from the recording |
| `ch12-sorted-{en,es}.png` | MiniCPM5-2B's four checkpoints answer the same question, sorted blind; the release names Sydney ("Sídney") as the capital in Spanish |
| `ch13-ledger-{en,es}.png` | Seven training methods: the data each needs, what it changes, what it can't do |
| `ch14-workshop-{en,es}.png` | The data workshop after the checks and the judge: copies and leaks found by text matching, contradictions by the judge, plus its false alarms |
| `ch15-plate-{en,es}.png` | LoRA arithmetic on MiniCPM5-2B's real shapes; a rank-16 adapter turns proverbs into taglines with the base fingerprint unchanged |
| `ch16-evidence-{en,es}.png` | The fine-tune learned the sign-off (0 → 10 of 10) and not the facts (1 → 1 of 5) |
| `ch17-worse-{en,es}.png` | What the fine-tune broke: the capital became Melbourne, signed by the Mercadito team |

## Shipped

- **Trainer worker** (ADR 8):
  - TF.js core on WebGPU, then WebGL, then CPU;
  - a 110k-parameter char-level GPT with LoRA;
  - checkpoints and base fingerprints, with recorded runs for machines
    without a GPU.
- **MiniCPM5-2B, recorded locally** (ADR 9):
  - four checkpoints, licences checked;
  - a real LoRA fine-tune with mlx-lm on the data workshop's clean rows.
- **Chapters 11–17**, each with a prediction before its measurement, in
  both languages:
  - 11, casting from scratch;
  - 12, stages;
  - 13, the ledger;
  - 14, the data workshop;
  - 15, the LoRA plate;
  - 16, train or not;
  - 17, before and after.
- **Chapter 17** runs the Act II eval runner unchanged, through a table
  adapter over the local recordings.

## Self-critique

What works:
- The surprises are real and come from the recordings:
  - the small model overfits on schedule;
  - a base checkpoint that already refuses;
  - a release that regresses in Spanish;
  - a fine-tune that learns the sign-off and forgets a capital.
- Chapters 14, 16 and 17 form one pipeline: the rows the learner cleans
  are the rows the fine-tune trained on, and chapter 17 evaluates it with
  the runner from chapter 6.
- The LoRA fingerprint makes "the base doesn't change" something you can
  check rather than take on trust.

Still open:
1. The masthead ticket wraps to two rows at 1440 px with 17 chapters. Act
   IV adds 5 more, so it needs the denser layout flagged in phase A.
2. The chapter 15 adapter moves the format (prices, "Free shipping") but
   not the words, and in Spanish no rank reaches half the lines with a
   price. It's honest, but the Spanish lesson is weaker.
3. The fine-tune is deliberately small and overfit (about ten passes, loss
   0.002). A better-tuned run would regress less. The chapter says so;
   phase E should show the tuned version.
4. Chapter 12 wraps the base model in a chat template so every stage gets
   the same bytes. A base model is usually prompted raw. Disclosed on
   screen, but a raw-prompt column would teach more.
5. Re-recording MiniCPM needs Apple silicon and about 20 GB. Live MiniCPM
   in the browser is out of reach at 2B.
6. Chapter 13 has no model in the loop: a reading table and a matching
   exercise. It's the thinnest bench in the act.
7. The main bundle is now 3.3 MB (867 kB gzipped). TF.js lives in its own
   worker chunk; the bundle-split session's work is still to be merged.
