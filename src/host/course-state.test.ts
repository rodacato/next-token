import { describe, expect, it } from "vitest";
import { chapterProgress, initialCourseState, localProgressStore, withChapter } from "./course-state";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

describe("localProgressStore", () => {
  it("round-trips progress", () => {
    const store = localProgressStore(memoryStorage());
    const state = withChapter(initialCourseState, "tokens", { stage: "measure", predictions: { language: "spanish" } });
    store.save(state);
    expect(chapterProgress(store.load(), "tokens").stage).toBe("measure");
  });

  it("falls back to a clean bench on corrupt data", () => {
    const storage = memoryStorage();
    storage.setItem("next-token:v1", "{not json");
    expect(localProgressStore(storage).load()).toEqual(initialCourseState);
  });

  it("clears everything on reset", () => {
    const store = localProgressStore(memoryStorage());
    store.save(withChapter(initialCourseState, "tokens", { stage: "debrief" }));
    store.clear();
    expect(store.load()).toEqual(initialCourseState);
  });
});
