// Records chapter 11's training runs in the real trainer worker, for machines that can't train live.
// Usage: npm run record:serve, then APP_URL=http://localhost:5350 npm run record:trainer
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

for (const corpusId of new Set(Object.values(chapter.corpus))) {
  const corpus = read<{ lines: string[] }>(join(root, "src", "content", "corpora", `${corpusId}.json`));
  const { train, val } = splitCorpus(corpus.lines, chapter.config.valShare, chapter.config.seed);
  const job = { ...chapter, config: chapter.config, train, val };
  console.log(`Training on ${corpusId}: ${train.length} lines, ${val.length} held out`);
  const run = await page.evaluate((j) => {
    if (!window.recordTraining) throw new Error("Recorder page did not load");
    return window.recordTraining(j as never);
  }, job);
  const out = join(outDir, `${corpusId}.json`);
  writeFileSync(out, JSON.stringify({ corpusId, recordedAt: new Date().toISOString().slice(0, 10), machine: "Apple M2 Max", ...run }, null, 2) + "\n");
  console.log(`Wrote ${out}`);
}
await browser.close();
