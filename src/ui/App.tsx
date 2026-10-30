import { lazy, Suspense, useEffect } from "react";
import { chapters } from "../content";
import type { Stage } from "../host/course-state";
import { detectLocale, type MessageKey } from "../i18n/catalog";
import { I18nProvider, useI18n } from "../i18n/I18nProvider";
import { ChapterFrame } from "./ChapterFrame";
import { useCourse } from "./CourseProvider";
import { Masthead } from "./Masthead";
import { Textures } from "./props/Textures";

const NextTokenChapter = lazy(() => import("./chapters/NextTokenChapter").then((m) => ({ default: m.NextTokenChapter })));
const TokensChapter = lazy(() => import("./chapters/TokensChapter").then((m) => ({ default: m.TokensChapter })));
const StickChapter = lazy(() => import("./chapters/StickChapter").then((m) => ({ default: m.StickChapter })));
const FabricationChapter = lazy(() => import("./chapters/FabricationChapter").then((m) => ({ default: m.FabricationChapter })));
const DuelChapter = lazy(() => import("./chapters/DuelChapter").then((m) => ({ default: m.DuelChapter })));
const EvalBuilderChapter = lazy(() => import("./chapters/EvalBuilderChapter").then((m) => ({ default: m.EvalBuilderChapter })));
const StructuredChapter = lazy(() => import("./chapters/StructuredChapter").then((m) => ({ default: m.StructuredChapter })));
const ToolsChapter = lazy(() => import("./chapters/ToolsChapter").then((m) => ({ default: m.ToolsChapter })));
const RagChapter = lazy(() => import("./chapters/RagChapter").then((m) => ({ default: m.RagChapter })));
const AgentsChapter = lazy(() => import("./chapters/AgentsChapter").then((m) => ({ default: m.AgentsChapter })));
const TrainerChapter = lazy(() => import("./chapters/TrainerChapter").then((m) => ({ default: m.TrainerChapter })));
const LoraChapter = lazy(() => import("./chapters/LoraChapter").then((m) => ({ default: m.LoraChapter })));
const StagesChapter = lazy(() => import("./chapters/StagesChapter").then((m) => ({ default: m.StagesChapter })));
const DatasetChapter = lazy(() => import("./chapters/DatasetChapter").then((m) => ({ default: m.DatasetChapter })));
const LedgerChapter = lazy(() => import("./chapters/LedgerChapter").then((m) => ({ default: m.LedgerChapter })));
const DecisionChapter = lazy(() => import("./chapters/DecisionChapter").then((m) => ({ default: m.DecisionChapter })));
const BeforeAfterChapter = lazy(() => import("./chapters/BeforeAfterChapter").then((m) => ({ default: m.BeforeAfterChapter })));
const FeaturesChapter = lazy(() => import("./chapters/FeaturesChapter").then((m) => ({ default: m.FeaturesChapter })));
const FailureChapter = lazy(() => import("./chapters/FailureChapter").then((m) => ({ default: m.FailureChapter })));
const BillChapter = lazy(() => import("./chapters/BillChapter").then((m) => ({ default: m.BillChapter })));
const LaunchChapter = lazy(() => import("./chapters/LaunchChapter").then((m) => ({ default: m.LaunchChapter })));
const FinaleChapter = lazy(() => import("./chapters/FinaleChapter").then((m) => ({ default: m.FinaleChapter })));

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
      <Suspense fallback={<p className="note chapter-loading">{t("shell.loading")}</p>}>
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
      {chapter.kind === "ledger" && <LedgerChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "decision" && <DecisionChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "before-after" && <BeforeAfterChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "commission-features" && <FeaturesChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "commission-failure" && <FailureChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "commission-bill" && <BillChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "commission-launch" && <LaunchChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "finale" && <FinaleChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      {chapter.kind === "eval-builder" && <EvalBuilderChapter key={`${chapter.id}:${locale}`} chapter={chapter} progress={progress} frame={frame} />}
      </Suspense>
    </div>
  );
}

export type FrameRenderer = (canAdvance: boolean, bench: React.ReactNode, stageExtra?: React.ReactNode) => React.ReactNode;
