import { z } from "zod";

export const stages = ["problem", "bench", "measure", "debrief"] as const;
export type Stage = (typeof stages)[number];

const chapterProgressSchema = z.object({
  stage: z.enum(stages),
  completedAt: z.iso.datetime().optional(),
  predictions: z.record(z.string(), z.union([z.string(), z.number()])),
});

export const courseStateSchema = z.object({
  version: z.literal(1),
  locale: z.string().nullable(),
  currentChapter: z.string().nullable(),
  chapters: z.record(z.string(), chapterProgressSchema),
  modelId: z.enum(["qwen2.5-0.5b", "smollm2-135m"]),
  modelOptedIn: z.boolean(),
  pricePerMillion: z.number().positive().nullable(),
  conversationsPerDay: z.number().int().positive().nullable(),
  pressSound: z.boolean().default(false),
});

export type ChapterProgress = z.infer<typeof chapterProgressSchema>;
export type CourseState = z.infer<typeof courseStateSchema>;

export const initialCourseState: CourseState = {
  version: 1,
  locale: null,
  currentChapter: null,
  chapters: {},
  modelId: "qwen2.5-0.5b",
  modelOptedIn: false,
  pricePerMillion: null,
  conversationsPerDay: null,
  pressSound: false,
};

export const freshChapter: ChapterProgress = { stage: "problem", predictions: {} };

// Standalone mode keeps progress on the device; the embedded adapter (Step 2) reports it to Dojo.
export type ProgressStore = {
  load(): CourseState;
  save(state: CourseState): void;
  clear(): void;
};

const STORAGE_KEY = "next-token:v1";

export function localProgressStore(storage: Storage | undefined = safeLocalStorage()): ProgressStore {
  return {
    load() {
      try {
        const raw = storage?.getItem(STORAGE_KEY);
        return raw ? courseStateSchema.parse(JSON.parse(raw)) : initialCourseState;
      } catch {
        return initialCourseState;
      }
    },
    save(state) {
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Private mode or a full quota: the course still works, it just forgets.
      }
    },
    clear() {
      try {
        storage?.removeItem(STORAGE_KEY);
      } catch {
        // Same as above.
      }
    },
  };
}

function safeLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function chapterProgress(state: CourseState, chapterId: string): ChapterProgress {
  return state.chapters[chapterId] ?? freshChapter;
}

export function withChapter(state: CourseState, chapterId: string, update: Partial<ChapterProgress>): CourseState {
  return {
    ...state,
    chapters: { ...state.chapters, [chapterId]: { ...chapterProgress(state, chapterId), ...update } },
  };
}
