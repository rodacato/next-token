// Records real next-token distributions from the in-browser model for every locale.
// Usage: npm run dev (port 5317), then npm run record:runs [modelId]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const base = process.env.APP_URL ?? "http://localhost:5317";
const modelId = process.argv[2] ?? "qwen2.5-0.5b";
const locales = ["en", "es-MX"];
const outDir = join(import.meta.dirname, "..", "src", "recordings", "next-token");
const profileDir = join(import.meta.dirname, "..", "node_modules", ".cache", "recorder-profile");

mkdirSync(outDir, { recursive: true });
const context = await chromium.launchPersistentContext(profileDir, { headless: true, args: ["--enable-unsafe-webgpu"] });
const page = await context.newPage();
page.on("console", (message) => console.log(`[page] ${message.text()}`));
await page.goto(`${base}/tools/record.html`);

// Files are written at the end: writing into src/ mid-run makes Vite reload the recorder page.
const runs = [];
for (const locale of locales) {
  console.log(`Recording ${locale} with ${modelId}…`);
  runs.push(await page.evaluate(([l, m]) => {
    if (!window.recordRuns) throw new Error("Recorder page did not load");
    return window.recordRuns(l, m as "qwen2.5-0.5b");
  }, [locale, modelId] as const));
}
for (const run of runs) {
  const file = join(outDir, `${run.locale}.json`);
  writeFileSync(file, JSON.stringify(run) + "\n");
  console.log(`  ${run.steps.length} steps on ${run.device}/${run.dtype} → ${file}`);
}

await context.close();
