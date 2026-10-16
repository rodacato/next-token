// Screenshots and a walkthrough video of the Step 1 slice, against a running dev server.
// Usage: APP_URL=http://localhost:5317 node scripts/capture-step1.ts
import { chromium, type Page } from "playwright";
import { mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

const base = process.env.APP_URL ?? "http://localhost:5317";
const out = join(import.meta.dirname, "..", "design", "step-1");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

async function typeSlowly(page: Page, testId: string, text: string) {
  await page.getByTestId(testId).click();
  await page.keyboard.type(text, { delay: 55 });
}

async function sweepTemperature(page: Page, from: number, to: number, steps: number, stepMs: number) {
  for (let i = 0; i <= steps; i++) {
    const value = String(Number((from + ((to - from) * i) / steps).toFixed(2)));
    await page.getByTestId("temperature").fill(value);
    await pause(page, stepMs);
  }
}

async function shots(locale: string, suffix: string) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale });
  await page.goto(`${base}/?compositor=recorded`);
  await page.evaluate(() => document.fonts.ready);
  await page.getByTestId("copy").fill(locale === "en" ? "The compositor doesn't know what's true. Mañana llegará tu pedido." : "El cajista no sabe qué es verdad. Tomorrow your order arrives.");
  await pause(page, 1500);
  await page.screenshot({ path: join(out, `ch1-bench-${suffix}.png`) });
  await page.getByTestId("advance").click();
  await page.getByTestId("advance").click();
  await page.getByTestId("measure").locator("input[type=radio]").nth(1).check();
  await page.getByTestId("run-measure").click();
  await pause(page, 800);
  await page.getByTestId("measure").scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(out, `ch1-measure-${suffix}.png`), fullPage: true });

  await page.locator(".ticket__link").nth(1).click();
  await page.getByTestId("fan").waitFor();
  await pause(page, 600);
  await page.screenshot({ path: join(out, `ch2-fan-${suffix}.png`) });
  await page.getByTestId("temperature").fill("0.15");
  await pause(page, 300);
  await page.screenshot({ path: join(out, `ch2-fan-cold-${suffix}.png`) });
  await page.getByTestId("temperature").fill("1.6");
  await pause(page, 300);
  await page.screenshot({ path: join(out, `ch2-fan-hot-${suffix}.png`) });
  await page.close();
}

async function mobile() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "en", isMobile: true });
  await page.goto(`${base}/?compositor=recorded`);
  await page.locator(".ticket__link").nth(1).click();
  await page.getByTestId("fan").waitFor();
  await pause(page, 600);
  await page.screenshot({ path: join(out, "ch2-mobile-en.png"), fullPage: true });
  await page.close();
}

async function walkthrough() {
  const videoDir = join(out, "video-tmp");
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en", recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } } });
  const page = await context.newPage();
  await page.goto(`${base}/?compositor=recorded`);
  await page.locator(".ticket__link").nth(1).click();
  await page.getByTestId("fan").waitFor();
  await pause(page, 900);
  await sweepTemperature(page, 0.8, 0.05, 10, 90);
  await pause(page, 500);
  await sweepTemperature(page, 0.05, 1.7, 24, 90);
  await pause(page, 700);
  await sweepTemperature(page, 1.7, 0.8, 8, 90);
  await page.getByTestId("fan").locator(".blade[data-rank=\"0\"]").click();
  await pause(page, 2200);
  await sweepTemperature(page, 0.8, 0.3, 5, 90);
  await page.getByTestId("draw").click();
  await pause(page, 2400);
  await page.locator(".ticket__link").nth(0).click();
  await pause(page, 600);
  await typeSlowly(page, "copy", "Mañana llegará tu pedido. Tomorrow your order arrives.");
  await pause(page, 1800);
  await context.close();
  const [video] = readdirSync(videoDir);
  if (video) renameSync(join(videoDir, video), join(out, "walkthrough-en.webm"));
  rmSync(videoDir, { recursive: true, force: true });
}

await shots("en", "en");
await shots("es-MX", "es");
await mobile();
await walkthrough();
await browser.close();
console.log(`Captures written to ${out}`);
