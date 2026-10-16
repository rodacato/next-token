// Screenshots every Step 0 board and records the animated prototype.
// Usage: npm run boards (in another terminal), then npm run boards:capture
import { chromium } from "playwright";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

const base = process.env.BOARDS_URL ?? "http://localhost:4317/design/step-0/";
const out = new URL("./captures/", import.meta.url).pathname;
const only = process.argv[2];

const boards = [
  { file: "a-composing-room.html", shots: [{ name: "a-composing-room-cold", temperature: 0.2 }, { name: "a-composing-room" , temperature: 0.8 }, { name: "a-composing-room-hot", temperature: 1.6 }] },
  { file: "b-specimen.html", shots: [{ name: "b-specimen-cold", temperature: 0.2 }, { name: "b-specimen" , temperature: 0.8 }, { name: "b-specimen-hot", temperature: 1.6 }] },
  { file: "c-forme.html", shots: [{ name: "c-forme-cold", temperature: 0.2 }, { name: "c-forme" , temperature: 0.8 }, { name: "c-forme-hot", temperature: 1.6 }] },
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch();

for (const board of boards) {
  if (only && !board.file.startsWith(only)) continue;
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto(base + board.file, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  for (const shot of board.shots) {
    if (shot.temperature) {
      await page.evaluate((t) => {
        const input = document.getElementById("temperature");
        input.value = String(t);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, shot.temperature);
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: join(out, `${shot.name}.png`) });
  }
  await page.close();
}

if (!only || only === "prototype") {
  const videoDir = join(out, "video-tmp");
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    recordVideo: { dir: videoDir, size: { width: 1600, height: 1000 } },
  });
  const page = await context.newPage();
  await page.goto(base + "prototype.html?autoplay=1", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  for (const second of [1, 3.6, 5.8, 7.3, 8.4, 9.6]) {
    await page.evaluate((s) => window.seekPrototype?.(s), second);
    await page.waitForTimeout(80);
    await page.screenshot({ path: join(out, `prototype-${String(second).replace(".", "_")}s.png`) });
  }
  await page.evaluate(() => window.restartPrototype?.());
  await page.waitForTimeout(10500);
  await context.close();
  const [video] = await readdir(videoDir);
  await rename(join(videoDir, video), join(out, "prototype.webm"));
  await rm(videoDir, { recursive: true });
}

await browser.close();
console.log("Captures written to", out);
