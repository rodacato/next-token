import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { currentManifest, manifestPath } from "./build-manifest";

const localeTag = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

describe("scroll.json", () => {
  const manifest = currentManifest();

  it("is committed up to date with the content", () => {
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual(manifest);
  });

  it("follows the rules Dojo's JSON Schema cannot express", () => {
    expect(new Set(manifest.units.map((u) => u.id)).size).toBe(manifest.units.length);
    expect(new Set(manifest.locales).size).toBe(manifest.locales.length);
    for (const locale of manifest.locales) {
      expect(locale).toMatch(localeTag);
      expect(manifest.title[locale]).toBeTruthy();
      expect(manifest.description[locale]).toBeTruthy();
      for (const unit of manifest.units) expect(unit.title[locale], `${unit.id} in ${locale}`).toBeTruthy();
    }
  });

  it("matches the schema's field rules", () => {
    expect(manifest.id).toMatch(/^[a-z0-9][a-z0-9-]{0,62}$/);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(manifest.protocol).toBe(0);
    expect(manifest.capabilities.every((c) => ["progress", "run", "llm"].includes(c))).toBe(true);
    for (const text of [...Object.values(manifest.title), ...Object.values(manifest.description)]) expect(text.length).toBeLessThanOrEqual(500);
  });
});
