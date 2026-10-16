import type { ReactNode } from "react";
import { findSource, type chapters } from "../content";
import { stages, type Stage } from "../host/course-state";
import type { MessageKey } from "../i18n/catalog";
import { useI18n } from "../i18n/I18nProvider";

type Chapter = (typeof chapters)[number];

type ChapterFrameProps = {
  readonly chapter: Chapter;
  readonly stage: Stage;
  readonly onStage: (stage: Stage) => void;
  readonly canAdvance: boolean;
  readonly nextChapterTitle: string | null;
  readonly onNextChapter: () => void;
  readonly stageExtra?: ReactNode;
  readonly bench: ReactNode;
};

export function ChapterFrame(props: ChapterFrameProps) {
  const { chapter, stage, onStage, canAdvance, nextChapterTitle, onNextChapter, stageExtra, bench } = props;
  const { t } = useI18n();
  const key = (suffix: string) => `chapters.${chapter.id}.${suffix}` as MessageKey;
  const stageIndex = stages.indexOf(stage);
  const nextStage = stages[stageIndex + 1];

  return (
    <main className={`chapter chapter--${chapter.id} chapter--at-${stage}`}>
      <aside className="copy-column">
        <div className="kicker">
          {t("shell.chapterLabel", { number: chapter.number })} · {t(key("kicker"))}
        </div>
        <h1 className="chapter__title">{t(key("title"))}</h1>

        <ol className="stage-rail" aria-label={t("shell.stageNumber", { number: stageIndex + 1 })}>
          {stages.map((s, index) => (
            <li key={s}>
              <button
                className={`stage-rail__mark${s === stage ? " is-current" : ""}${index < stageIndex ? " is-past" : ""}`}
                aria-current={s === stage ? "step" : undefined}
                disabled={index > stageIndex}
                onClick={() => onStage(s)}
              >
                <span className="stage-rail__number">{index + 1}</span>
                {t(`shell.stages.${s}` as MessageKey)}
              </button>
            </li>
          ))}
        </ol>

        <section className="stage-copy" aria-live="polite">
          {stage === "debrief" ? (
            <Debrief chapter={chapter} />
          ) : (
            <>
              <h2>{t(key(`${stage}.heading`))}</h2>
              <p>{t(key(`${stage}.body`))}</p>
              {stage === "problem" && <p className="stage-copy__task">{t(key("problem.task"))}</p>}
              {stage === "bench" && <p className="note">{t(key("bench.observe"))}</p>}
              {stage === "bench" && chapter.kind === "next-token" && <p className="note">{t("chapters.next-token.bench.pieces")}</p>}
              {stage === "measure" && <p className="note">{t("shell.honor")}</p>}
            </>
          )}
          {stageExtra}
        </section>

        <div className="stage-nav">
          {nextStage ? (
            <button className="button button--primary" disabled={!canAdvance} onClick={() => onStage(nextStage)} data-testid="advance">
              {t(`shell.stages.${nextStage}` as MessageKey)} →
            </button>
          ) : (
            nextChapterTitle && (
              <button className="button button--primary" onClick={onNextChapter} data-testid="next-chapter">
                {t("shell.next", { title: nextChapterTitle })} →
              </button>
            )
          )}
        </div>
      </aside>

      <section id="bench" className="bench" aria-label={t(key("bench.heading"))} tabIndex={-1}>
        {bench}
      </section>
    </main>
  );
}

function Debrief({ chapter }: { chapter: Chapter }) {
  const { t } = useI18n();
  const key = (suffix: string) => `chapters.${chapter.id}.debrief.${suffix}` as MessageKey;
  return (
    <>
      <h2>{t(key("heading"))}</h2>
      <ol className="debrief-points">
        {(["one", "two", "three", "four"] as const).map((point) => (
          <li key={point}>{t(key(`points.${point}`))}</li>
        ))}
      </ol>
      <p className="voice">{t(key("voice"))}</p>
      <h3 className="kicker read-next__heading">{t("readNext.heading")}</h3>
      <ul className="read-next">
        {chapter.readNext.map((id) => {
          const source = findSource(id);
          if (!source) return null;
          return (
            <li key={id}>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>
              <span className="note">
                {" "}
                {source.authors}, {source.year}
              </span>
              <p>{t(`readNext.why.${id}` as MessageKey)}</p>
            </li>
          );
        })}
      </ul>
    </>
  );
}
