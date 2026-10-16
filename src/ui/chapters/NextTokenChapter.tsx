import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { NextTokenChapter as NextTokenContent } from "../../content/schema";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import { NoRecordingError, type Compositor, type Reading } from "../../model/compositor";
import {
  drawCandidate,
  perplexity,
  seededRandom,
  shapeDistribution,
  tallyDraws,
  type DrawTally,
  type RandomSource,
  type ShapedCandidate,
  type ShapedDistribution,
} from "../../model/sampling";
import { sortFace } from "../../model/tokenizers";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";
import { useDebounced } from "../hooks";
import { ComposingStick } from "../props/ComposingStick";
import { Lever } from "../props/Lever";
import { PressAndProof } from "../props/PressAndProof";
import { Sort } from "../props/Sort";
import { TypeCase } from "../props/TypeCase";
import { FAN_SIZE, FAN_VIEWBOX, TypographicFan } from "../props/TypographicFan";
import { useCompositor } from "../useCompositor";
import { CompositorPanel } from "./CompositorPanel";

type Props = { readonly chapter: NextTokenContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };

type ReadOutcome = { readonly context: string; readonly compositor: Compositor; readonly state: ReadingState };

type ReadingState =
  | { readonly status: "idle" }
  | { readonly status: "reading" }
  | { readonly status: "ready"; readonly reading: Reading }
  | { readonly status: "no-recording" }
  | { readonly status: "failed"; readonly reason: string };

const COMMIT_BEAT_MS = 420;

export function NextTokenChapter({ chapter, progress, frame }: Props) {
  const { t, locale, formatNumber } = useI18n();
  const { state: course, update, updateChapter } = useCourse();
  const startingCopy = chapter.defaultCopy[locale] ?? Object.values(chapter.defaultCopy)[0] ?? "";
  const [copy, setCopy] = useState(startingCopy);
  const [setCount, setSetCount] = useState(0);
  const [lastSet, setLastSet] = useState("");
  const [temperature, setTemperature] = useState(0.8);
  const [topP, setTopP] = useState(0.95);
  const [chosenTokenId, setChosenTokenId] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<ReadOutcome | null>(null);
  const [lastReading, setLastReading] = useState<Reading | null>(null);
  const [tallies, setTallies] = useState<{ cold: DrawTally[]; hot: DrawTally[] } | null>(null);
  const random = useRef<RandomSource | null>(null);
  const settledCopy = useDebounced(copy, 220);

  const compositor = useCompositor(locale, course.modelId, course.modelOptedIn);

  useEffect(() => {
    const active = compositor.active;
    if (!active || settledCopy.trim() === "") return;
    let current = true;
    const key = { context: settledCopy, compositor: active };
    active
      .read(settledCopy)
      .then((result) => {
        if (!current) return;
        setOutcome({ ...key, state: { status: "ready", reading: result } });
        setLastReading(result);
      })
      .catch((error: unknown) => {
        if (!current) return;
        const state: ReadingState =
          error instanceof NoRecordingError ? { status: "no-recording" } : { status: "failed", reason: error instanceof Error ? error.message : String(error) };
        setOutcome({ ...key, state });
      });
    return () => {
      current = false;
    };
  }, [settledCopy, compositor.active]);

  const reading: ReadingState =
    outcome && outcome.context === settledCopy && outcome.compositor === compositor.active && settledCopy === copy
      ? outcome.state
      : compositor.active
        ? { status: "reading" }
        : { status: "idle" };
  const shown = reading.status === "ready" ? reading.reading : reading.status === "reading" ? lastReading : null;
  const distribution = useMemo<ShapedDistribution | null>(
    () => (shown ? shapeDistribution(shown.candidates, shown.logits, { temperature, topP }) : null),
    [shown, temperature, topP],
  );

  const commit = useCallback((candidate: ShapedCandidate) => {
    setChosenTokenId(candidate.tokenId);
    setTimeout(() => {
      setCopy((c) => c + candidate.text);
      setLastSet(candidate.text);
      setSetCount((n) => n + 1);
      setChosenTokenId(null);
    }, COMMIT_BEAT_MS);
  }, []);

  const draw = () => {
    if (!distribution) return;
    random.current ??= seededRandom(Date.now());
    commit(drawCandidate(distribution, random.current));
  };

  const fanArea = useRef<HTMLDivElement>(null);
  const nextSlot = useRef<HTMLSpanElement>(null);
  const [originX, setOriginX] = useState(260);
  useLayoutEffect(() => {
    const area = fanArea.current;
    if (!area) return;
    const measure = () => {
      const slot = nextSlot.current?.getBoundingClientRect();
      const box = area.getBoundingClientRect();
      if (!slot || box.width === 0) return;
      setOriginX(((slot.left + slot.width / 2 - box.left) / box.width) * FAN_VIEWBOX.width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [shown]);

  const runMeasurement = () => {
    if (!shown) return;
    const { draws, coldTemperature, hotTemperature, seed } = chapter.measurement;
    const at = (temp: number) => shapeDistribution(shown.candidates, shown.logits, { temperature: temp, topP: 1 });
    setTallies({ cold: tallyDraws(at(coldTemperature), draws, seededRandom(seed)), hot: tallyDraws(at(hotTemperature), draws, seededRandom(seed + 1)) });
    updateChapter(chapter.id, { predictions: { ...progress.predictions, measured: 1 } });
  };

  const percent = (p: number) => formatNumber(p, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const remark = remarkFor(temperature);
  const source = shown?.source;
  const impressionText = lastSet && copy.endsWith(lastSet) ? copy.slice(0, copy.length - lastSet.length) : copy;

  const bench = (
    <div className="bench-grid bench-grid--next">
      <label className="copy-sheet">
        <span className="kicker">{t("bench.copy")}</span>
        <textarea data-testid="copy" value={copy} rows={1} onChange={(e) => setCopy(e.target.value)} spellCheck={false} />
      </label>

      <div className="next__stick">
        <ComposingStick
          ref={nextSlot}
          testId="stick"
          label={t("bench.stick")}
          count={shown ? t("bench.stickCount", { count: shown.pieces.length }) : undefined}
          pieces={shown?.pieces ?? []}
          nextLabel={t("bench.next")}
        >
          {chosenTokenId !== null && distribution && (
            <Sort
              text={distribution.candidates.find((c) => c.tokenId === chosenTokenId)?.text ?? ""}
              tokenId={chosenTokenId}
              variant="chosen"
            />
          )}
        </ComposingStick>
      </div>

      <div className="next__fan" ref={fanArea} aria-busy={reading.status === "reading"}>
        {distribution ? (
          <>
            <TypographicFan
              distribution={distribution}
              originX={originX}
              chosenTokenId={chosenTokenId}
              onPick={commit}
              label={t("fan.label")}
              pulledLabel={t("fan.pulled")}
              formatPercent={percent}
              tailLabel={t("fan.tail", {
                count: formatNumber(Math.max(0, (shown?.logits.length ?? 0) - FAN_SIZE)),
                share: percent(1 - distribution.candidates.slice(0, FAN_SIZE).reduce((s, c) => s + c.probability, 0)),
              })}
            />
            <p className="fan__source note" data-testid="run-source">
              {source?.kind === "recorded"
                ? t("model.recorded", { model: source.model, date: source.recordedAt })
                : t("fan.choices", { value: formatNumber(perplexity(distribution), { maximumFractionDigits: 1 }) })}
            </p>
          </>
        ) : (
          <div className="fan__empty">
            {reading.status === "reading" && <p className="voice">{t("model.thinking")}</p>}
            {reading.status === "no-recording" && <p className="voice">{t("model.noRecording")}</p>}
            {reading.status === "failed" && <p className="error-line">{t("model.failed", { reason: reading.reason })}</p>}
          </div>
        )}
      </div>

      <aside className="next__controls">
        <CompositorPanel
          state={compositor.state}
          device={compositor.device}
          modelId={course.modelId}
          onChooseModel={(id) => update((s) => ({ ...s, modelId: id }))}
          onLoad={() => {
            update((s) => ({ ...s, modelOptedIn: true }));
            void compositor.load();
          }}
          elapsed={reading.status === "ready" && reading.reading.source.kind === "live" ? { ms: reading.reading.elapsedMs, tokens: reading.reading.pieces.length } : null}
        />
        <Lever testId="temperature" label={t("fan.temperature")} value={temperature} min={0} max={2} step={0.01} marks={[`0 ${t("fan.cold")}`, `2 ${t("fan.hot")}`]} onChange={setTemperature} />
        <p className="remark">{t(remark)}</p>
        <Lever testId="top-p" label={t("fan.topP")} value={topP} min={0.05} max={1} step={0.01} marks={[t("fan.narrow"), t("fan.all")]} onChange={setTopP} />
        <div className="actions">
          <button className="button button--primary" onClick={draw} disabled={!distribution || chosenTokenId !== null} data-testid="draw">
            {t("fan.draw")}
          </button>
          <span className="note">{t("fan.pickHint")}</span>
        </div>
        {distribution && <Slip distribution={distribution} chosenTokenId={chosenTokenId} percent={percent} />}
      </aside>

      <div className="next__case">
        <TypeCase label={shown ? t("bench.case", { count: formatNumber(shown.logits.length) }) : t("bench.caseUnknown")} width={420} height={220} />
      </div>

      <div className="next__press">
        <PressAndProof
          pressLabel={t("bench.press")}
          proofLabel={`${t("bench.proof")} · ${t("bench.impression", { count: setCount })}`}
          impressionCount={setCount}
          empty={t("bench.proofEmpty")}
          impression={
            <>
              {impressionText}
              {lastSet && <span className="is-new">{lastSet}</span>}
            </>
          }
        />
        <button
          className="button button--quiet"
          onClick={() => {
            setCopy(startingCopy);
            setSetCount(0);
            setLastSet("");
          }}
        >
          {t("fan.clearLine")}
        </button>
      </div>

      {(progress.stage === "measure" || progress.stage === "debrief") && (
        <DrawMeasurement chapter={chapter} progress={progress} tallies={tallies} canRun={Boolean(shown)} onRun={runMeasurement} />
      )}
    </div>
  );

  const canAdvance = progress.stage !== "measure" || tallies !== null || progress.predictions.measured === 1;
  return frame(canAdvance, bench);
}

function remarkFor(temperature: number): MessageKey {
  if (temperature < 0.02) return "fan.remark.greedy";
  if (temperature < 0.45) return "fan.remark.cold";
  if (temperature < 1.1) return "fan.remark.warm";
  if (temperature < 1.6) return "fan.remark.hot";
  return "fan.remark.scalding";
}

function Slip({ distribution, chosenTokenId, percent }: { distribution: ShapedDistribution; chosenTokenId: number | null; percent: (p: number) => string }) {
  const { t } = useI18n();
  return (
    <div className="slip" data-testid="slip">
      <span className="kicker">{t("bench.slip")}</span>
      <table>
        <thead>
          <tr>
            <th className="kicker">{t("bench.slipHead.sort")}</th>
            <th className="kicker">{t("bench.slipHead.logit")}</th>
            <th className="kicker">{t("bench.slipHead.probability")}</th>
          </tr>
        </thead>
        <tbody>
          {distribution.candidates.slice(0, FAN_SIZE).map((c) => (
            <tr key={c.tokenId} className={c.tokenId === chosenTokenId ? "is-chosen" : c.inNucleus ? "" : "is-pulled"}>
              <td>{sortFace(c.text).label}</td>
              <td>{c.logit.toFixed(2)}</td>
              <td>{percent(c.probability)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type DrawMeasurementProps = {
  readonly chapter: NextTokenContent;
  readonly progress: ChapterProgress;
  readonly tallies: { cold: DrawTally[]; hot: DrawTally[] } | null;
  readonly canRun: boolean;
  readonly onRun: () => void;
};

function DrawMeasurement({ chapter, progress, tallies, canRun, onRun }: DrawMeasurementProps) {
  const { t, formatNumber } = useI18n();
  const { updateChapter } = useCourse();
  const { draws, coldTemperature, hotTemperature } = chapter.measurement;
  const prediction = (key: "cold" | "hot") => (typeof progress.predictions[key] === "number" ? (progress.predictions[key] as number) : "");
  const setPrediction = (key: "cold" | "hot", value: number) =>
    updateChapter(chapter.id, { predictions: { ...progress.predictions, [key]: Math.max(1, Math.min(draws, Math.round(value))) } });
  const ready = prediction("cold") !== "" && prediction("hot") !== "";

  const rows: { key: "cold" | "hot"; temperature: number }[] = [
    { key: "cold", temperature: coldTemperature },
    { key: "hot", temperature: hotTemperature },
  ];

  return (
    <section className="measure-sheet measure-sheet--draws" data-testid="measure">
      <fieldset className="prediction" disabled={tallies !== null}>
        {rows.map(({ key, temperature }) => (
          <label key={key} className="prediction__number">
            <span>{t(key === "cold" ? "chapters.next-token.measure.predictCold" : "chapters.next-token.measure.predictHot", { temperature: formatNumber(temperature) })}</span>
            <input data-testid={`predict-${key}`} type="number" min={1} max={draws} value={prediction(key)} onChange={(e) => setPrediction(key, Number(e.target.value))} />
          </label>
        ))}
      </fieldset>
      {!tallies && (
        <button className="button button--primary" disabled={!ready || !canRun} onClick={onRun} data-testid="run-measure">
          {t("chapters.next-token.measure.run")}
        </button>
      )}
      {tallies && (
        <div className="galleys">
          {rows.map(({ key, temperature }) => (
            <figure key={key} className="galley" data-testid={`tally-${key}`}>
              <figcaption>
                <span className="kicker">{t("chapters.next-token.measure.drawsAt", { draws, temperature: formatNumber(temperature) })}</span>
                <strong>{t("chapters.next-token.measure.distinct", { count: tallies[key].length })}</strong>
                <span className="note">{t("chapters.next-token.measure.predicted", { count: prediction(key) })}</span>
              </figcaption>
              <div className="galley__columns">
                {tallies[key].map((tally) => (
                  <div key={tally.text} className="galley__column" title={`${tally.count}`}>
                    {Array.from({ length: tally.count }, (_, i) => (
                      <span key={i} className="galley__sort" />
                    ))}
                    <span className="galley__label">{sortFace(tally.text).label}</span>
                  </div>
                ))}
              </div>
            </figure>
          ))}
          <p className="note">{t("chapters.next-token.measure.seed")}</p>
        </div>
      )}
    </section>
  );
}
