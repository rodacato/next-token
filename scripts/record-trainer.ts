// Records chapter 11's training runs in the real trainer worker, for machines that can't train live.
// Usage: npm run record:serve, then APP_URL=http://localhost:5350 npm run record:trainer -- casting|lora
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { splitCorpus } from "../src/trainer/corpus.ts";

const root = join(import.meta.dirname, "..");
const base = process.env.APP_URL ?? "http://localhost:5350";
const outDir = join(root, "src", "recordings", "trainer");
const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
type Chapter = { corpus: Record<string, string>; config: { seed: number; valShare: number }; every: number; sampleEvery: number; temperature: number; stops: number[]; sampleCount: number; sampleSeed: number };

const chapter = read<Chapter>(join(root, "src", "content", "chapters", "11-casting.json"));
mkdirSync(outDir, { recursive: true });
// Full Chromium (not the headless shell) reaches the GPU, so the run uses WebGPU as a learner's laptop would.
const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--enable-unsafe-webgpu"] });
const page = await browser.newPage();
page.on("console", (m) => console.log(`[page] ${m.text()}`));
await page.goto(`${base}/tools/train.html`);

const which = process.argv[2] ?? "casting";
const record = (j: unknown) =>
  page.evaluate((job) => {
    if (!window.recordTraining) throw new Error("Recorder page did not load");
    return window.recordTraining(job as never);
  }, j);
const today = new Date().toISOString().slice(0, 10);

if (which === "casting") {
  for (const corpusId of new Set(Object.values(chapter.corpus))) {
    const corpus = read<{ lines: string[] }>(join(root, "src", "content", "corpora", `${corpusId}.json`));
    const { train, val } = splitCorpus(corpus.lines, chapter.config.valShare, chapter.config.seed);
    console.log(`Training on ${corpusId}: ${train.length} lines, ${val.length} held out`);
    const run = await record({ ...chapter, train, val });
    const out = join(outDir, `${corpusId}.json`);
    writeFileSync(out, JSON.stringify({ corpusId, recordedAt: today, machine: "Apple M2 Max", ...run }, null, 2) + "\n");
    console.log(`Wrote ${out}`);
  }
}

// Chapter 15: a base model per language (its vocabulary already holds the adapter's characters),
// then an adapter at each rank, trained on Mercadito taglines with the base frozen.
type LoraChapter = { base: { corpus: Record<string, string>; steps: number }; adapter: { corpus: Record<string, string>; ranks: number[]; alphaPerRank: number; steps: number; learningRate: number }; every: number; sampleEvery: number; temperature: number; sampleCount: number; sampleSeed: number };
if (which === "lora") {
  const lora = read<LoraChapter>(join(root, "src", "content", "chapters", "15-lora.json"));
  const pace = { every: lora.every, sampleEvery: lora.sampleEvery, temperature: lora.temperature, sampleCount: lora.sampleCount, sampleSeed: lora.sampleSeed };
  for (const [locale, baseId] of Object.entries(lora.base.corpus)) {
    const adapterId = lora.adapter.corpus[locale] ?? "";
    const corpus = read<{ lines: string[] }>(join(root, "src", "content", "corpora", `${baseId}.json`));
    const taglines = read<{ lines: string[] }>(join(root, "src", "content", "corpora", `${adapterId}.json`));
    const split = splitCorpus(corpus.lines, chapter.config.valShare, chapter.config.seed);
    const config = { ...chapter.config, vocabExtra: taglines.lines.join("") };
    console.log(`Base for ${locale} on ${baseId}, ${lora.base.steps} steps`);
    const base = await record({ ...pace, config, train: split.train, val: split.val, stops: [lora.base.steps], save: true });
    writeFileSync(join(outDir, `${baseId}-base.json`), JSON.stringify({ corpusId: baseId, recordedAt: today, steps: lora.base.steps, checkpoint: base.checkpoint }) + "\n");
    const adapterSplit = splitCorpus(taglines.lines, chapter.config.valShare, chapter.config.seed);
    const ranks = [];
    for (const rank of lora.adapter.ranks) {
      console.log(`Adapter rank ${rank} on ${adapterId}`);
      const run = await record({
        ...pace,
        config: { ...config, learningRate: lora.adapter.learningRate },
        train: adapterSplit.train,
        val: adapterSplit.val,
        base: base.checkpoint,
        lora: { rank, alpha: rank * lora.adapter.alphaPerRank },
        stops: [lora.adapter.steps],
        compareAdapter: true,
      });
      ranks.push({ rank, loraParams: run.loraParams, baseParams: run.baseParams, points: run.points, adapter: run.adapter });
    }
    const out = join(outDir, `lora-${locale}.json`);
    writeFileSync(out, JSON.stringify({ locale, recordedAt: today, machine: "Apple M2 Max", backend: base.backend, ranks }, null, 2) + "\n");
    console.log(`Wrote ${out}`);
  }
}
await browser.close();
