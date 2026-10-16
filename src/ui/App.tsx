import { useEffect } from "react";
import { chapters } from "../content";
import type { Stage } from "../host/course-state";
import { detectLocale, type MessageKey } from "../i18n/catalog";
import { I18nProvider, useI18n } from "../i18n/I18nProvider";
import { ChapterFrame } from "./ChapterFrame";
import { NextTokenChapter } from "./chapters/NextTokenChapter";
import { TokensChapter } from "./chapters/TokensChapter";
import { StickChapter } from "./chapters/StickChapter";
import { FabricationChapter } from "./chapters/FabricationChapter";
import { DuelChapter } from "./chapters/DuelChapter";
import { EvalBuilderChapter } from "./chapters/EvalBuilderChapter";
import { StructuredChapter } from "./chapters/StructuredChapter";
import { ToolsChapter } from "./chapters/ToolsChapter";
import { RagChapter } from "./chapters/RagChapter";
import { AgentsChapter } from "./chapters/AgentsChapter";
import { TrainerChapter } from "./chapters/TrainerChapter";
import { LoraChapter } from "./chapters/LoraChapter";
import { StagesChapter } from "./chapters/StagesChapter";
import { DatasetChapter } from "./chapters/DatasetChapter";
import { useCourse } from "./CourseProvider";
import { Masthead } from "./Masthead";
import { Textures } from "./props/Textures";

export function App() {
  const { state } = useCourse();
  const locale = state.locale ?? detectLocale(navigator.languages);
  return (
    <I18nProvider locale={locale}>
      <Textures />
      <Course />
    </I18nProvider>
  );
}

function Course() {
  const { t, locale } = useI18n();
  const { state, update, progressOf, updateChapter } = useCourse();
  const chapter = chapters.find((c) => c.id === state.currentChapter) ?? chapters[0];
  if (!chapter) throw new Error("The course has no chapters.");
  const progress = progressOf(chapter.id);
  const nextChapter = chapters[chapters.indexOf(chapter) + 1];

  const openChapter = (id: string) => {
    update((s) => ({ ...s, currentChapter: id }));
    window.scrollTo({ top: 0 });
  };

  const setStage = (stage: Stage) => {
    updateChapter(chapter.id, {
      stage,
      ...(stage === "debrief" && !progress.completedAt ? { completedAt: new Date().toISOString() } : {}),
    });
  };

  useEffect(() => {
    document.title = `${t(`chapters.${chapter.id}.title` as MessageKey)} · ${t("course.title")}`;
  }, [chapter.id, t]);

  const frame = (canAdvance: boolean, bench: React.ReactNode, stageExtra?: React.ReactNode) => (
    <ChapterFrame
      chapter={chapter}
      stage={progress.stage}
      onStage={setStage}
      canAdvance={canAdvance}
      nextChapterTitle={nextChapter ? t(`chapters.${nextChapter.id}.title` as MessageKey) : null}
      onNextChapter={() => nextChapter && openChapter(nextChapter.id)}
      stageExtra={stageExtra}
      bench={bench}
    />
  );

  return (
    <div className="course">
      <Masthead currentChapterId={chapter.id} onOpenChapter={openChapter} />
      {chapter.kind === "tokens" && <TokensChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "next-token" && <NextTokenChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "stick" && <StickChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "fabrication" && <FabricationChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "duel" && <DuelChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "structured" && <StructuredChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "tools" && <ToolsChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "rag" && <RagChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "agents" && <AgentsChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "trainer" && <TrainerChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "lora" && <LoraChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "stages" && <StagesChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "dataset" && <DatasetChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "eval-builder" && <EvalBuilderChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
    </div>
  );
}

export type FrameRenderer = (canAdvance: boolean, bench: React.ReactNode, stageExtra?: React.ReactNode) => React.ReactNode;
