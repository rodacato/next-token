// Screenshots of phase B (chapters 7 to 10) against a running dev server.
// Usage: APP_URL=http://localhost:5317 node scripts/capture-phase-b.ts
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const base = process.env.APP_URL ?? "http://localhost:5317";
const out = join(import.meta.dirname, "..", "design", "phase-b");
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

  await openChapter(page, 7);
  await advance(page);
  await page.getByTestId("feed-press").click();
  await page.getByTestId("sheet-stack").locator("li").nth(5).waitFor();
  await shot(page, `ch7-press-${suffix}.png`);

  await openChapter(page, 8);
  await advance(page);
  await page.getByTestId("start-docket").click();
  // In English the model looks the order up again after a wrong row; in Spanish it asks the customer.
  if (locale === "en") await page.getByTestId("result-wrong-row").click();
  await page.getByTestId("result-right-row").click();
  await page.getByTestId("result-refuse").click();
  await page.getByTestId("hand-back").waitFor({ state: "detached" });
  await shot(page, `ch8-docket-${suffix}.png`);

  await openChapter(page, 9);
  await advance(page);
  await page.getByTestId("embedder-source").filter({ hasText: "e5" }).waitFor();
  await page.getByTestId("ask").click();
  await page.getByTestId("rag-answer").waitFor();
  await shot(page, `ch9-case-${suffix}.png`);
  await advance(page);
  await page.locator('input[name="rag-predict"]').nth(2).check();
  await page.getByTestId("run-grid").click();
  await page.getByTestId("rag-finding").waitFor();
  await page.getByTestId("measure").screenshot({ path: join(out, `ch9-grid-${suffix}.png`) });

  await page.close();
}

await browser.close();
console.log(`Wrote screenshots to ${out}`);
