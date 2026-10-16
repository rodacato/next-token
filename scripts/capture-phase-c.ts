// Screenshots of phase C (chapters 11 to 17), on recorded runs, against a running dev server.
// Usage: APP_URL=http://localhost:5317 node scripts/capture-phase-c.ts
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const base = process.env.APP_URL ?? "http://localhost:5317";
const out = join(import.meta.dirname, "..", "design", "phase-c");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();

async function openChapter(page: Page, number: number) {
  await page.goto(`${base}/?compositor=recorded`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".ticket__link").nth(number - 1).click();
}

const advance = (page: Page) => page.getByTestId("advance").click();
const shot = (page: Page, name: string) => page.screenshot({ path: join(out, name), fullPage: true });

for (const [locale, suffix] of [["en", "en"], ["es-MX", "es"]] as const) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale, reducedMotion: "reduce" });

  await openChapter(page, 11);
  await advance(page);
  await page.getByTestId("cast").click();
  await page.getByTestId("stop-2000").waitFor({ timeout: 30_000 });
  await shot(page, `ch11-recorded-${suffix}.png`);

  await openChapter(page, 12);
  await advance(page);
  await page.locator('input[name="stage-prompt"]').nth(3).check();
  const slips = page.getByTestId("blind-sort").locator("li");
  for (let i = 0; i < 4; i++) await slips.nth(i).locator("input").nth(i).check();
  await page.getByTestId("reveal").click();
  await shot(page, `ch12-sorted-${suffix}.png`);

  await openChapter(page, 13);
  await advance(page);
  await page.locator(".link-button").first().click();
  await shot(page, `ch13-ledger-${suffix}.png`);

  await openChapter(page, 14);
  await advance(page);
  await page.getByTestId(`flag-${suffix === "en" ? "en" : "es"}-25`).selectOption("contradiction");
  await advance(page);
  await page.getByTestId("predict-mechanical").fill("8");
  await page.getByTestId("run-checks").click();
  await page.getByTestId("run-judge").click();
  await page.getByTestId("workshop-finding").filter({ hasText: /judge|juez/i }).waitFor();
  await shot(page, `ch14-workshop-${suffix}.png`);

  await openChapter(page, 15);
  await advance(page);
  await page.getByTestId("train-adapter").click();
  await page.getByTestId("adapter-sheet").waitFor();
  await shot(page, `ch15-plate-${suffix}.png`);

  await openChapter(page, 16);
  await advance(page);
  await page.getByTestId("evidence").waitFor();
  await shot(page, `ch16-evidence-${suffix}.png`);

  await openChapter(page, 17);
  await advance(page);
  await page.getByTestId("run-before-after").click();
  await page.getByTestId("result-galley").waitFor();
  await advance(page);
  await page.getByTestId("predict-worse").fill("1");
  await page.getByTestId("run-general").click();
  await page.getByTestId("worse-list").waitFor();
  await page.getByTestId("measure").screenshot({ path: join(out, `ch17-worse-${suffix}.png`) });

  await page.close();
}

await browser.close();
console.log(`Wrote screenshots to ${out}`);
