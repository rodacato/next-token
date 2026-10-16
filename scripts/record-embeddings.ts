// Embeds chapter 9's chunks and questions with the same model the browser loads, and writes them
// as a recording, so the chapter retrieves without a 118 MB download.
// Usage: npm run record:embeddings [-- --show]
import { pipeline } from "@huggingface/transformers";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chunk, chunkStrategies, encodeVector, passageText, queryText, rank } from "../src/rag/chunking.ts";
import { embedders } from "../src/rag/embedders.ts";

type PerLocale = Record<string, string>;
type RagChapter = { id: string; embedder: string; fixedSize: number; handbook: PerLocale; questions: { id: string; text: PerLocale }[] };

const root = join(import.meta.dirname, "..");
const chapter = JSON.parse(readFileSync(join(root, "src", "content", "chapters", "09-rag.json"), "utf8")) as RagChapter;
const spec = embedders.find((e) => e.id === chapter.embedder);
if (!spec) throw new Error(`Unknown embedder ${chapter.embedder}`);
const show = process.argv.includes("--show");

const extract = await pipeline("feature-extraction", spec.repo, { dtype: spec.dtype });
const embed = async (text: string) => new Float32Array((await extract(text, { pooling: "mean", normalize: true })).data as Float32Array);

for (const locale of Object.keys(chapter.handbook)) {
  const handbook = chapter.handbook[locale] ?? "";
  const passages: Record<string, string> = {};
  const chunks: Record<string, { text: string; vector: Float32Array }[]> = {};
  for (const strategy of chunkStrategies) {
    chunks[strategy] = [];
    for (const text of chunk(handbook, strategy, chapter.fixedSize)) {
      const vector = await embed(passageText(text));
      chunks[strategy].push({ text, vector });
      passages[text] = encodeVector(vector);
    }
  }
  const queries: Record<string, string> = {};
  for (const question of chapter.questions) {
    const text = question.text[locale] ?? "";
    const vector = await embed(queryText(text));
    queries[text] = encodeVector(vector);
    if (!show) continue;
    console.log(`\n${locale} · ${question.id}`);
    for (const strategy of chunkStrategies) {
      const top = rank(vector, chunks[strategy] ?? []).slice(0, 3);
      console.log(`  ${strategy}: ${top.map((r) => `${r.score.toFixed(3)} «${r.text.slice(0, 70)}»`).join("\n           ")}`);
    }
  }
  const out = join(root, "src", "recordings", "embeddings", `${locale}.json`);
  const recording = { model: spec.name, repo: spec.repo, dtype: spec.dtype, recordedAt: new Date().toISOString().slice(0, 10), via: "transformers.js (Node)", passages, queries };
  writeFileSync(out, JSON.stringify(recording, null, 2) + "\n");
  console.log(`Wrote ${out}: ${Object.keys(passages).length} passages, ${Object.keys(queries).length} queries`);
}
