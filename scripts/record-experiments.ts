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
  return shared / Math.max(x.size, y.size, 1) >= 0.8 || isTruncationOf(a, b) || isTruncationOf(b, a);
}

const sequence = (text: string) => text.toLowerCase().normalize("NFD").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);

// A truncated real title still points at a real paper, but only if its words appear in the same order.
function isTruncationOf(short: string, long: string): boolean {
  const s = sequence(short).join(" ");
  return s.split(" ").length >= 4 && ` ${sequence(long).join(" ")} `.includes(` ${s} `);
}

// A reference counts as found only when one of OpenAlex's top title matches is the same title.
async function check(reference: string): Promise<ReferenceCheck> {
  const title = titleOf(reference);
  const base = { text: reference, checkedAt: today, checkedWith: "openalex-title-search" as const };
  if (words(title).size < 3) return { ...base, verdict: "not-found", lookup: "no-title" };
  const query = title.replace(/[,:?!]/g, " ");
  const url = `https://api.openalex.org/works?filter=title.search:${encodeURIComponent(query)}&per-page=5&select=title,id`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url);
    if (response.status === 429) {
      await pause(5_000 * (attempt + 1));
      continue;
    }
    if (!response.ok) throw new Error(`OpenAlex answered ${response.status} for: ${title}`);
    const body = (await response.json()) as { results?: { title: string | null; id: string }[] };
    const candidates = (body.results ?? []).filter((r): r is { title: string; id: string } => Boolean(r.title));
    const match = candidates.find((r) => sameTitle(r.title, title));
    if (match) return { ...base, verdict: "found", matchedTitle: match.title, matchedUrl: match.id };
    return { ...base, verdict: "not-found", ...(candidates[0] ? { matchedTitle: candidates[0].title } : {}) };
  }
  throw new Error(`OpenAlex kept rate-limiting the check for: ${title}`);
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
