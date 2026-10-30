import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  chapterProgress,
  initialCourseState,
  withChapter,
  type ChapterProgress,
  type CourseState,
  type ProgressStore,
} from "../host/course-state";

type Course = {
  readonly state: CourseState;
  readonly update: (change: (state: CourseState) => CourseState) => void;
  readonly progressOf: (chapterId: string) => ChapterProgress;
  readonly updateChapter: (chapterId: string, change: Partial<ChapterProgress>) => void;
  readonly reset: () => void;
};

const CourseContext = createContext<Course | null>(null);

export function CourseProvider({ store, children }: { store: ProgressStore; children: ReactNode }) {
  const [state, setState] = useState<CourseState>(() => store.load());

  useEffect(() => store.save(state), [state, store]);

  const update = useCallback((change: (s: CourseState) => CourseState) => setState(change), []);
  const updateChapter = useCallback(
    (chapterId: string, change: Partial<ChapterProgress>) => setState((s) => withChapter(s, chapterId, change)),
    [],
  );
  const reset = useCallback(() => {
    store.clear();
    setState((s) => ({ ...initialCourseState, walkthroughSeen: s.walkthroughSeen }));
  }, [store]);

  const value = useMemo<Course>(
    () => ({ state, update, updateChapter, reset, progressOf: (id) => chapterProgress(state, id) }),
    [state, update, updateChapter, reset],
  );
  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
}

export function useCourse(): Course {
  const value = useContext(CourseContext);
  if (!value) throw new Error("useCourse must be used inside CourseProvider.");
  return value;
}
