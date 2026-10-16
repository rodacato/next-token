import { recordedSetSchema, type RecordedSet } from "./recorded-schema";

const sets = import.meta.glob("../recordings/llm/*.json", { eager: true, import: "default" });

export const recordedSets: readonly RecordedSet[] = Object.values(sets).map((raw) => recordedSetSchema.parse(raw));

export function findRecordedSet(recipeId: string): RecordedSet | undefined {
  return recordedSets.find((set) => set.recipeId === recipeId);
}
