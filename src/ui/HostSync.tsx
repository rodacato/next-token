import { useEffect, useRef, useState } from "react";
import { chapters } from "../content";
import { connectToHost, type Connection } from "../host/connect";
import { useCourse } from "./CourseProvider";

// Bridges course state and the host: applies what init says, then reports what the learner does.
export function HostSync() {
  const { state, update, updateChapter, progressOf } = useCourse();
  const [connection, setConnection] = useState<Connection | null>(null);
  const started = useRef(new Set<string>());
  const completed = useRef(new Set<string>());
  const courseReported = useRef(false);

  useEffect(() => {
    let current = true;
    void connectToHost().then((conn) => {
      if (!current) return;
      setConnection(conn);
      if (conn.session.mode !== "embedded") return;
      const hostLocale = conn.session.locale;
      if (hostLocale) update((s) => ({ ...s, locale: hostLocale }));
      for (const [unitId, unit] of Object.entries(conn.session.progress)) {
        if (!unit.completed) continue;
        completed.current.add(unitId);
        update((s) => {
          const chapter = s.chapters[unitId];
          if (chapter?.completedAt) return s;
          return { ...s, chapters: { ...s.chapters, [unitId]: { stage: "debrief", predictions: chapter?.predictions ?? {}, completedAt: new Date().toISOString() } } };
        });
      }
    });
    return () => {
      current = false;
    };
  }, [update]);

  useEffect(() => {
    if (!connection) return;
    return connection.bridge.onLocaleChange((locale) => update((s) => ({ ...s, locale })));
  }, [connection, update]);

  const currentChapter = state.currentChapter ?? chapters[0]?.id ?? null;
  useEffect(() => {
    if (!connection || !currentChapter || started.current.has(currentChapter)) return;
    started.current.add(currentChapter);
    connection.bridge.unitStarted(currentChapter);
  }, [connection, currentChapter]);

  useEffect(() => {
    if (!connection) return;
    for (const chapter of chapters) {
      const progress = progressOf(chapter.id);
      if (!progress.completedAt || completed.current.has(chapter.id)) continue;
      completed.current.add(chapter.id);
      connection.bridge.unitCompleted(chapter.id, { stage: progress.stage, predictions: progress.predictions });
    }
    const allDone = chapters.every((c) => progressOf(c.id).completedAt);
    if (allDone && !courseReported.current) {
      courseReported.current = true;
      connection.bridge.courseCompleted();
    }
  }, [connection, state.chapters, progressOf, updateChapter]);

  useEffect(() => {
    if (!connection || connection.bridge.mode !== "embedded") return;
    const report = () => connection.bridge.resized(document.documentElement.scrollHeight);
    const observer = new ResizeObserver(report);
    observer.observe(document.body);
    report();
    return () => observer.disconnect();
  }, [connection]);

  return null;
}
