import { z } from "zod";
import { chapterSchema, sourceSchema, type Chapter, type Source } from "./schema";
import rawSources from "./sources.json";

// Adding a chapter is adding a JSON file to ./chapters; the engines pick it up by kind.
const chapterFiles = import.meta.glob("./chapters/*.json", { eager: true, import: "default" });

export const chapters: readonly Chapter[] = Object.keys(chapterFiles)
  .sort()
  .map((path) => chapterSchema.parse(chapterFiles[path]));

export const sources: readonly Source[] = z.array(sourceSchema).parse(rawSources);

export function findSource(id: string): Source | undefined {
  return sources.find((source) => source.id === id);
}

export function findChapter(id: string): Chapter | undefined {
  return chapters.find((chapter) => chapter.id === id);
}
