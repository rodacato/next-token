import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { FabricationChapter as FabricationContent } from "../../content/schema";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import { compositionRecordingSchema, type CompositionRecording } from "../../model/experiment-recordings";
import { findRecordedSet } from "../../llm/recorded";
import { firstEntryNumber } from "../../model/experiments";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";
import { referenceConfidence } from "./reference-confidence";

type Props = { readonly chapter: FabricationContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };

const recordings = import.meta.glob("../../recordings/experiments/references.*.json", { import: "default" });
const marks = ["real", "invented", "unsure"] as const;
const SORT_INTERVAL_MS = 45;

export function FabricationChapter({ chapter, progress, frame }: Props) {
  const { t, locale, formatNumber } = useI18n();
  const { updateChapter } = useCourse();
  const reduceMotion = useReducedMotion();
  const [recording, setRecording] = useState<CompositionRecording | null>(null);
  const [visible, setVisible] = useState(progress.predictions.written === 1 ? Number.MAX_SAFE_INTEGER : 0);
  const [writing, setWriting] = useState(false);
  const checked = progress.predictions.checked === 1;

  useEffect(() => {
    let current = true;
    const loader = recordings[`../../recordings/experiments/references.${locale}.json`];
    void loader?.().then((raw) => current && setRecording(compositionRecordingSchema.parse(raw)));
    return () => {
      current = false;
    };
  }, [locale]);

  useEffect(() => {
    if (!writing || !recording) return;
    if (visible >= recording.sorts.length) {
      const done = setTimeout(() => {
        setWriting(false);
        updateChapter(chapter.id, { predictions: { ...progress.predictions, written: 1 } });
      }, 0);
      return () => clearTimeout(done);
    }
    const timer = setTimeout(() => setVisible((n) => n + 1), SORT_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [writing, visible, recording, updateChapter, chapter.id, progress.predictions]);

  const write = () => {
    if (!recording) return;
    if (reduceMotion) {
      setVisible(recording.sorts.length);
      updateChapter(chapter.id, { predictions: { ...progress.predictions, written: 1 } });
    } else {
      setVisible(0);
      setWriting(true);
    }
  };

  const written = recording !== null && visible >= recording.sorts.length && !writing;
  const markOf = (index: number) => progress.predictions[`mark-${index}`] as string | undefined;
  const allMarked = recording !== null && recording.references.every((_, i) => markOf(i));
  const confidences = recording ? referenceConfidence(recording.sorts, recording.references.length) : [];
  const percent = (p: number) => formatNumber(p, { style: "percent", maximumFractionDigits: 0 });
  const invented = recording ? recording.references.filter((r) => r.verdict === "not-found") : [];
  const inventedConfidence = recording
    ? recording.references.reduce((acc, r, i) => (r.verdict === "not-found" ? [...acc, confidences[i] ?? 0] : acc), [] as number[])
    : [];
  const contrast = findRecordedSet(chapter.contrastRecipe)?.completions.find((c) => c.locale === locale);

  const bench = (
    <div className="fabrication-bench">
      <figure className="prompt-slip">
        <figcaption className="kicker">{t("fabrication.prompt")}</figcaption>
        <pre>{chapter.referencePrompt[locale]}</pre>
      </figure>

      <div className="actions actions--row">
        <button className="button button--primary" disabled={!recording || writing} onClick={write} data-testid="write">
          {writing && recording ? t("fabrication.writing", { count: visible }) : t("fabrication.write")}
        </button>
        <span className="note">{t("fabrication.inkNote")}</span>
      </div>

      {recording && (
        <div className="ink-galley" data-testid="ink-galley" aria-live="polite">
          {recording.sorts.slice(0, visible).map((sort, i) => (
            <span key={i} className={sort.given ? "ink-sort ink-sort--given" : "ink-sort"} style={sort.given ? undefined : { opacity: 0.25 + 0.75 * sort.probability }} title={sort.given ? undefined : percent(sort.probability)}>
              {sort.text}
            </span>
          ))}
          {recording && (visible > 0 || written) && (
            <p className="note ink-galley__source">
              {t("model.recorded", { model: recording.model, date: recording.recordedAt })}{" "}
              {t("fabrication.samplingNote", { temperature: recording.sampling.temperature, topP: recording.sampling.topP, penalty: recording.sampling.repetitionPenalty, seed: recording.sampling.seed })}
            </p>
          )}
        </div>
      )}

      {written && recording && (
        <ol className="reference-proof" data-testid="references">
          {recording.references.map((reference, i) => (
            <li key={i} className={checked ? `is-${reference.verdict}` : ""}>
              <span className="kicker">{t("fabrication.reference", { number: i + firstEntryNumber(recording.prompt) })}</span>
              <p className="reference-proof__text">{reference.text}</p>
              <fieldset className="prediction" disabled={checked}>
                <legend className="visually-hidden">{t("fabrication.mark")}</legend>
                {marks.map((mark) => (
                  <label key={mark} className={`prediction__option${markOf(i) === mark ? " is-chosen" : ""}`}>
                    <input
                      type="radio"
                      name={`mark-${i}`}
                      value={mark}
                      checked={markOf(i) === mark}
                      onChange={() => updateChapter(chapter.id, { predictions: { ...progress.predictions, [`mark-${i}`]: mark } })}
                    />
                    {t(`fabrication.marks.${mark}` as MessageKey)}
                  </label>
                ))}
              </fieldset>
              {checked && (
                <p className="reference-proof__verdict" data-testid={`verdict-${i}`}>
                  {reference.verdict === "found" ? (
                    <a href={reference.matchedUrl} target="_blank" rel="noreferrer">
                      {t("fabrication.found", { title: reference.matchedTitle ?? "" })}
                    </a>
                  ) : (
                    <strong>{t("fabrication.notFound")}</strong>
                  )}{" "}
                  <span className="note">{t("fabrication.confidence", { value: percent(confidences[i] ?? 0) })}</span>
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {written && (progress.stage === "measure" || progress.stage === "debrief") && recording && (
        <section className="measure-sheet" data-testid="measure">
          {!checked && (
            <button
              className="button button--primary"
              disabled={!allMarked}
              onClick={() => updateChapter(chapter.id, { predictions: { ...progress.predictions, checked: 1 } })}
              data-testid="check-catalog"
            >
              {t("fabrication.check")}
            </button>
          )}
          {!allMarked && <p className="note">{t("fabrication.mark")}</p>}
          {checked && (
            <>
              <p className="measure-sheet__finding" data-testid="fabrication-summary">
                {t("fabrication.summary", {
                  invented: invented.length,
                  total: recording.references.length,
                  confidence: percent(inventedConfidence.length ? inventedConfidence.reduce((a, b) => a + b, 0) / inventedConfidence.length : 0),
                })}
              </p>
              <p className="note">{t("fabrication.checkedWith", { date: recording.references[0]?.checkedAt ?? recording.recordedAt })}</p>
              {contrast && (
                <aside className="contrast-slip">
                  <h3 className="kicker">{t("fabrication.contrastHeading")}</h3>
                  <p>{t("fabrication.contrastBody")}</p>
                  <pre>{contrast.output.replace(/\*([^*]+)\*/g, "$1")}</pre>
                  <p className="note">{t("model.recorded", { model: contrast.model, date: findRecordedSet(chapter.contrastRecipe)?.recordedAt ?? "" })}</p>
                </aside>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );

  const canAdvance = progress.stage === "bench" ? written && allMarked : progress.stage === "measure" ? checked : true;
  return frame(canAdvance, bench);
}
