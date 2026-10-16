// Writes the Dojo scroll manifest next to index.html, generated from content so it never drifts.
// Usage: npm run manifest (also runs before every build)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildManifest } from "../src/host/manifest.ts";

const root = join(import.meta.dirname, "..");
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8")) as unknown;

export function currentManifest() {
  const localesDir = join(root, "src", "i18n", "locales");
  const chaptersDir = join(root, "src", "content", "chapters");
  const catalogs = Object.fromEntries(
    readdirSync(localesDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => [f.replace(/\.json$/, ""), readJson(join(localesDir, f))]),
  );
  const chapterIds = readdirSync(chaptersDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => (readJson(join(chaptersDir, f)) as { id: string }).id);
  const { version } = readJson(join(root, "package.json")) as { version: string };
  return buildManifest({ version, chapterIds, catalogs });
}

export const manifestPath = join(root, "public", "scroll.json");

if (process.argv[1] === import.meta.filename) {
  const manifest = currentManifest();
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${manifestPath}: ${manifest.units.length} units, locales ${manifest.locales.join(", ")}`);
}
