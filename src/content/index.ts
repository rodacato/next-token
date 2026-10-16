import { z } from "zod";
import { evalSetSchema, type EvalSet } from "../evals/types";
import { chapterSchema, corpusSchema, datasetSchema, type Dataset, duelSchema, sourceSchema, type Chapter, type Corpus, type Duel, type Source } from "./schema";
import rawSources from "./sources.json";

// Adding a chapter is adding a JSON file to ./chapters; the engines pick it up by kind.
const chapterFiles = import.meta.glob("./chapters/*.json", { eager: true, import: "default" });

export const chapters: readonly Chapter[] = Object.keys(chapterFiles)
  .sort()
  .map((path) => chapterSchema.parse(chapterFiles[path]));

export const sources: readonly Source[] = z.array(sourceSchema).parse(rawSources);

const evalFiles = import.meta.glob("./evals/*.json", { eager: true, import: "default" });
const duelFiles = import.meta.glob("./duels/*.json", { eager: true, import: "default" });

export const evalSets: readonly EvalSet[] = Object.values(evalFiles).map((raw) => evalSetSchema.parse(raw));
export const duels: readonly Duel[] = Object.values(duelFiles).map((raw) => duelSchema.parse(raw));

export function findEvalSet(id: string): EvalSet | undefined {
  return evalSets.find((set) => set.id === id);
}

export function findDuel(id: string): Duel | undefined {
  return duels.find((duel) => duel.id === id);
}

export function findSource(id: string): Source | undefined {
  return sources.find((source) => source.id === id);
}

export function findChapter(id: string): Chapter | undefined {
  return chapters.find((chapter) => chapter.id === id);
}

const corpusFiles = import.meta.glob("./corpora/*.json", { eager: true, import: "default" });
export const corpora: readonly Corpus[] = Object.values(corpusFiles).map((raw) => corpusSchema.parse(raw));

export function findCorpus(id: string): Corpus | undefined {
  return corpora.find((corpus) => corpus.id === id);
}

const datasetFiles = import.meta.glob("./datasets/*.json", { eager: true, import: "default" });
export const datasets: readonly Dataset[] = Object.values(datasetFiles).map((raw) => datasetSchema.parse(raw));

export function findDataset(id: string): Dataset | undefined {
  return datasets.find((dataset) => dataset.id === id);
}
