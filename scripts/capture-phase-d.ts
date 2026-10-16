// Screenshots of phase D (chapters 18 to 22) against a running dev server.
// Usage: APP_URL=http://localhost:5317 node scripts/capture-phase-d.ts
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const base = process.env.APP_URL ?? "http://localhost:5317";
const out = join(import.meta.dirname, "..", "design", "phase-d");
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

  await openChapter(page, 18);
  await advance(page);
  await page.getByTestId("run-month").click();
  await shot(page, `ch18-month-${suffix}.png`);

  await openChapter(page, 19);
  await advance(page);
  await page.getByTestId("safeguard-uncertainty").check();
  await page.getByTestId("safeguard-lastWord").check();
  await page.getByTestId("run-conversations").click();
  await shot(page, `ch19-design-${suffix}.png`);

  await openChapter(page, 20);
  await advance(page);
  await page.getByTestId("strong-share").fill("25");
  await page.getByTestId("caching").check();
  await shot(page, `ch20-bill-${suffix}.png`);

  await openChapter(page, 21);
  await advance(page);
  await page.getByTestId("run-launch").click();
  await page.getByTestId("week-chart").waitFor();
  await shot(page, `ch21-launch-${suffix}.png`);

  await openChapter(page, 22);
  await advance(page);
  await page.getByTestId("field-goal").fill(suffix === "en" ? "Helps customers." : "Ayuda a los clientes.");
  await advance(page);
  await page.locator('input[name="approvals"]').nth(2).check();
  await page.getByTestId("submit-board").click();
  await page.getByTestId("board").waitFor();
  await page.getByTestId("measure").screenshot({ path: join(out, `ch22-board-${suffix}.png`) });

  await page.close();
}

await browser.close();
console.log(`Wrote screenshots to ${out}`);
