// Fails CI when any locale is missing a key, has an extra one, or drops a {placeholder}.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Tree = { [key: string]: string | Tree };

export function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix + key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path + ".")) out.set(k, v);
  }
  return out;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

export function compareCatalogs(source: Map<string, string>, target: Map<string, string>): string[] {
  const problems: string[] = [];
  for (const [key, text] of source) {
    const translated = target.get(key);
    if (translated === undefined) problems.push(`missing ${key}`);
    else if (placeholders(text) !== placeholders(translated)) problems.push(`placeholders differ in ${key}`);
    else if (translated.trim() === "") problems.push(`empty ${key}`);
  }
  for (const key of target.keys()) if (!source.has(key)) problems.push(`extra ${key}`);
  return problems;
}

function main() {
  const dir = join(import.meta.dirname, "..", "src", "i18n", "locales");
  const read = (file: string) => flatten(JSON.parse(readFileSync(join(dir, file), "utf8")) as Tree);
  const source = read("en.json");
  let failed = false;
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "en.json")) {
    const problems = compareCatalogs(source, read(file));
    for (const problem of problems) console.error(`${file}: ${problem}`);
    failed ||= problems.length > 0;
    if (problems.length === 0) console.log(`${file}: ${source.size} keys, all present`);
  }
  if (failed) process.exit(1);
}

if (process.argv[1] === import.meta.filename) main();
