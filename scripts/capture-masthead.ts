// Masthead screenshots at three widths in both locales.
// Usage: APP_URL=http://localhost:5317 node scripts/capture-masthead.ts before|after
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const base = process.env.APP_URL ?? "http://localhost:5317";
const label = process.argv[2] ?? "after";
const out = join(import.meta.dirname, "..", "design", "masthead");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();

for (const [locale, suffix] of [["en", "en"], ["es-MX", "es"]] as const) {
  for (const width of [1440, 1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 700 }, locale, reducedMotion: "reduce" });
    await page.goto(`${base}/?compositor=recorded`);
    await page.evaluate(() => document.fonts.ready);
    if (width < 900) await page.locator(".ticket__acts button").nth(3).click();
    await page.getByRole("button", { name: /^21 / }).click();
    await page.locator(".masthead").screenshot({ path: join(out, `${label}-${width}-${suffix}.png`) });
    await page.close();
  }
}

await browser.close();
console.log(`Wrote ${label} screenshots to ${out}`);
