// Runs chapter 3 and 4 experiments on the in-browser model, then checks each invented reference.
// Usage: npm run dev, then APP_URL=http://localhost:5317 npm run record:experiments
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  compositionRecordingSchema,
  needleRecordingSchema,
  type ReferenceCheck,
} from "../src/model/experiment-recordings.ts";

const base = process.env.APP_URL ?? "http://localhost:5317";
const modelId = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? "qwen2.5-0.5b";
const locales = ["en", "es-MX"];
const outDir = join(import.meta.dirname, "..", "src", "recordings", "experiments");
const profileDir = join(import.meta.dirname, "..", "node_modules", ".cache", "recorder-profile");
const today = new Date().toISOString().slice(0, 10);
const rawPath = join(import.meta.dirname, "..", "node_modules", ".cache", "experiments-raw.json");
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function titleOf(reference: string): string {
  const afterYear = /\(\d{4}[a-z]?\)\.?\s*(.+)$/.exec(reference)?.[1] ?? reference;
  const beforeVenue = afterYear.split(/\.?\s+In\s+(?=[A-Z])/)[0] ?? afterYear;
  return beforeVenue.replace(/[*_"“”]/g, "").replace(/\.$/, "").trim();
}

const words = (text: string) => new Set(text.toLowerCase().normalize("NFD").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean));

export function sameTitle(a: string, b: string): boolean {
  const x = words(a);
  const y = words(b);
  const shared = [...x].filter((w) => y.has(w)).length;
  const shorter = Math.min(x.size, y.size);
  // A truncated real title (all of its words inside the catalog title) still points at a real paper.
  return shared / Math.max(x.size, y.size, 1) >= 0.8 || (shorter >= 4 && shared / shorter >= 0.9);
}

// A reference counts as found only when Semantic Scholar's best title match is the same title.
async function check(reference: string): Promise<ReferenceCheck> {
  const title = titleOf(reference);
  if (words(title).size < 3) return { text: reference, verdict: "not-found", checkedAt: today, checkedWith: "semantic-scholar-title-match", lookup: "no-title" };
  const url = `https://api.semanticscholar.org/graph/v1/paper/search/match?query=${encodeURIComponent(title)}&fields=title,url`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await fetch(url);
    if (response.status === 429) {
      await pause(15_000 * (attempt + 1));
      continue;
    }
    const base = { text: reference, checkedAt: today, checkedWith: "semantic-scholar-title-match" as const };
    if (response.status === 404) return { ...base, verdict: "not-found" };
    const body = (await response.json()) as { data?: { title: string; url: string }[] };
    const match = body.data?.[0];
    if (match && sameTitle(match.title, title)) return { ...base, verdict: "found", matchedTitle: match.title, matchedUrl: match.url };
    return { ...base, verdict: "not-found", ...(match ? { matchedTitle: match.title } : {}) };
  }
  throw new Error(`Semantic Scholar kept rate-limiting the check for: ${title}`);
}

// Full Chromium (not the headless shell) can reach the GPU, so WebGPU with shader-f16 is available.
async function recordInBrowser() {
  const context = await chromium.launchPersistentContext(profileDir, { channel: "chromium", headless: true, args: ["--enable-unsafe-webgpu"] });
  const page = await context.newPage();
  page.on("console", (message) => console.log(`[page] ${message.text()}`));
  await page.goto(`${base}/tools/record.html`);
  const runs = [];
  for (const locale of locales) {
    console.log(`Recording experiments for ${locale}…`);
    runs.push(
      await page.evaluate(([l, m]) => {
        if (!window.recordExperiments) throw new Error("Recorder page did not load");
        return window.recordExperiments(l, m as "qwen2.5-0.5b");
      }, [locale, modelId] as const),
    );
  }
  await context.close();
  return runs;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  // --check-only re-runs the catalog lookups on the last saved run, without the model.
  const checkOnly = process.argv.includes("--check-only");
  if (checkOnly && !existsSync(rawPath)) throw new Error("No saved run to check; record first.");
  const runs = checkOnly ? (JSON.parse(readFileSync(rawPath, "utf8")) as Awaited<ReturnType<typeof recordInBrowser>>) : await recordInBrowser();
  if (!checkOnly) writeFileSync(rawPath, JSON.stringify(runs));

  for (const run of runs) {
    const references: ReferenceCheck[] = [];
    for (const reference of run.composition.references) {
      references.push(await check(reference));
      await pause(1200);
    }
    const needle = needleRecordingSchema.parse({ ...run.needle, recordedAt: today });
    const composition = compositionRecordingSchema.parse({ ...run.composition, recordedAt: today, references });
    writeFileSync(join(outDir, `needle.${run.needle.locale}.json`), JSON.stringify(needle, null, 2) + "\n");
    writeFileSync(join(outDir, `references.${run.needle.locale}.json`), JSON.stringify(composition, null, 2) + "\n");
    console.log(`${run.needle.locale}: needle ${needle.results.map((r) => r.probability.toFixed(2)).join(" ")}`);
    references.forEach((r) => console.log(`  ${r.verdict}: ${r.text}`));
  }
}

if (process.argv[1] === import.meta.filename) await main();
