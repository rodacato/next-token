import { describe, expect, it } from "vitest";
import { availableLocales, catalogs, lookup } from "../i18n/catalog";
import { chapters, findSource } from "./index";

const chapterKeys = ["title", "kicker", "problem.heading", "problem.body", "bench.heading", "measure.heading", "debrief.heading", "debrief.voice"];

describe("content", () => {
  it("numbers chapters uniquely and in order", () => {
    expect(chapters.map((c) => c.number)).toEqual([...chapters.map((c) => c.number)].sort((a, b) => a - b));
    expect(new Set(chapters.map((c) => c.id)).size).toBe(chapters.length);
  });

  it.each(availableLocales)("has the chapter strings every engine needs in %s", (locale) => {
    const catalog = catalogs.get(locale);
    if (!catalog) throw new Error(`missing ${locale}`);
    for (const chapter of chapters) {
      for (const key of chapterKeys) expect(lookup(catalog, `chapters.${chapter.id}.${key}`), `${chapter.id}.${key}`).toBeTypeOf("string");
    }
  });

  it.each(availableLocales)("explains every read-next source in %s", (locale) => {
    const catalog = catalogs.get(locale);
    if (!catalog) throw new Error(`missing ${locale}`);
    for (const id of chapters.flatMap((c) => c.readNext)) {
      expect(findSource(id), id).toBeDefined();
      expect(lookup(catalog, `readNext.why.${id}`), id).toBeTypeOf("string");
    }
  });

  it("gives the next-token chapter copy for every locale", () => {
    for (const chapter of chapters) {
      if (chapter.kind !== "next-token") continue;
      for (const locale of availableLocales) expect(chapter.defaultCopy[locale], locale).toBeTruthy();
    }
  });
});
