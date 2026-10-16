// Screenshots of phase A (chapters 3 and 4, the phone fan) against a running dev server.
// Usage: APP_URL=http://localhost:5317 node scripts/capture-phase-a.ts
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const base = process.env.APP_URL ?? "http://localhost:5317";
const out = join(import.meta.dirname, "..", "design", "phase-a");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();

async function openChapter(page: Page, index: number) {
  await page.goto(`${base}/?compositor=recorded`);
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".ticket__link").nth(index).click();
}

const advance = (page: Page) => page.getByTestId("advance").click();

for (const [locale, suffix] of [["en", "en"], ["es-MX", "es"]] as const) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale, reducedMotion: "reduce" });

  await openChapter(page, 2);
  await advance(page);
  await page.getByTestId("all-messages").click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, `ch3-overflow-${suffix}.png`) });
  await page.locator(".rule-plate").nth(1).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, `ch3-clamped-${suffix}.png`) });
  await advance(page);
  await page.locator('input[name="needle-guess"]').nth(1).check();
  await page.getByTestId("run-measure").click();
  await page.getByTestId("needle-chart").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(out, `ch3-needle-${suffix}.png`) });

  await openChapter(page, 3);
  await advance(page);
  await page.getByTestId("write").click();
  const references = page.getByTestId("references").locator("li");
  await references.first().waitFor();
  await page.screenshot({ path: join(out, `ch4-written-${suffix}.png`) });
  const count = await references.count();
  for (let i = 0; i < count; i++) await references.nth(i).locator('input[value="invented"]').check();
  await advance(page);
  await page.getByTestId("check-catalog").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, `ch4-checked-${suffix}.png`), fullPage: true });
  await page.close();
}

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, locale: "en" });
await openChapter(phone, 1);
await phone.getByTestId("fan").waitFor();
await phone.getByTestId("fan").scrollIntoViewIfNeeded();
await phone.waitForTimeout(500);
await phone.screenshot({ path: join(out, "ch2-phone-fan-en.png") });
await phone.close();

await browser.close();
console.log(`Captures written to ${out}`);
