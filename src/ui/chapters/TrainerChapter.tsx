import { useEffect, useMemo, useRef, useState } from "react";
import type { TrainerChapter as TrainerContent } from "../../content/schema";
import { findCorpus } from "../../content";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import { TrainerClient } from "../../trainer/client";
import { splitCorpus } from "../../trainer/corpus";
import type { TrainerBackend } from "../../trainer/protocol";
import type { LossPoint, Sample } from "../../trainer/session";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";
import { LossChart } from "./LossChart";

type Props = { readonly chapter: TrainerContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };
type Stop = { readonly step: number; readonly samples: readonly Sample[] };
type Logged = { readonly step: number; readonly samples: readonly Sample[] };
type Recording = { recordedAt: string; machine: string; backend: string; baseParams: number; points: (LossPoint & { elapsedMs: number; samples?: Sample[] })[]; stops: Stop[] };
type Source = { readonly kind: "live"; readonly backend: TrainerBackend | null } | { readonly kind: "recorded"; readonly recording: Recording };
const recordings = import.meta.glob("../../recordings/trainer/*.json", { import: "default" });
const REPLAY_MS = 9000;

export function TrainerChapter({ chapter, progress, frame }: Props) {
  const { t, locale, formatNumber } = useI18n();
  const { updateChapter } = useCourse();
  const [corpusId, setCorpusId] = useState(chapter.corpus[locale] ?? Object.values(chapter.corpus)[0] ?? "");
  const [recording, setRecording] = useState<Recording | null>(null);
  const [mode, setMode] = useState<"recorded" | "live">("recorded");
  const [points, setPoints] = useState<LossPoint[]>([]);
  const [log, setLog] = useState<Logged[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [running, setRunning] = useState(false);
  const [backend, setBackend] = useState<TrainerBackend | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const client = useRef<TrainerClient | null>(null);
  const timers = useRef<number[]>([]);
  const corpus = findCorpus(corpusId);

  useEffect(() => {
    let alive = true;
    void recordings[`../../recordings/trainer/${corpusId}.json`]?.().then((raw) => alive && setRecording(raw as Recording));
    return () => {
      alive = false;
    };
  }, [corpusId]);

  useEffect(
    () => () => {
      client.current?.terminate();
      timers.current.forEach((id) => window.clearTimeout(id));
    },
    [],
  );

  const reset = () => {
    client.current?.terminate();
    client.current = null;
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    setPoints([]);
    setLog([]);
    setStops([]);
    setFailure(null);
    setElapsed(0);
  };

  // The recorded run plays back at a fixed pace; every point and sample is what the worker streamed.
  const replay = (rec: Recording) => {
    reset();
    setRunning(true);
    const total = rec.points.at(-1)?.step ?? chapter.steps;
    rec.points.forEach((p, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setPoints((ps) => [...ps, { step: p.step, train: p.train, val: p.val }]);
          setElapsed(p.elapsedMs);
          if (p.samples) setLog((l) => [{ step: p.step, samples: p.samples ?? [] }, ...l]);
          const stop = rec.stops.find((s) => s.step === p.step);
          if (stop) setStops((s) => [...s, stop]);
          if (i === rec.points.length - 1) setRunning(false);
        }, (REPLAY_MS * p.step) / total),
      );
    });
  };

  const trainLive = async () => {
    if (!corpus) return;
    reset();
    setRunning(true);
    const worker = new TrainerClient();
    client.current = worker;
    const { train, val } = splitCorpus(corpus.lines, chapter.config.valShare, chapter.config.seed);
    const startedAt = performance.now();
    worker.listen((m) => {
      if (m.type === "progress") {
        setPoints((ps) => [...ps, { step: m.step, train: m.train, val: m.val }]);
        setElapsed(performance.now() - startedAt);
        if (m.samples) setLog((l) => [{ step: m.step, samples: m.samples ?? [] }, ...l]);
      } else if (m.type === "failed") setFailure(m.reason);
    });
    try {
      worker.send({ type: "init", config: chapter.config, train, val });
      setBackend((await worker.once("ready")).backend);
      let at = 0;
      for (const step of chapter.stops) {
        worker.send({ type: "train", steps: step - at, every: chapter.every, sampleEvery: chapter.sampleEvery, temperature: chapter.temperature });
        at = (await worker.once("stopped")).step;
        if (at < step) break;
        worker.send({ type: "sample", count: chapter.sampleCount, temperature: chapter.temperature, seed: chapter.sampleSeed, loraOn: false });
        const { samples } = await worker.once("samples");
        setStops((s) => [...s, { step: at, samples }]);
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  };

  const stopLive = () => client.current?.send({ type: "stop" });
  const guess = typeof progress.predictions.copied === "number" ? progress.predictions.copied : null;
  const measuring = progress.stage === "measure" || progress.stage === "debrief";
  const last = stops.find((s) => s.step === chapter.steps);
  const lowest = useMemo(() => points.reduce<LossPoint | null>((a, p) => (!a || p.val < a.val ? p : a), null), [points]);
  const source: Source = mode === "live" ? { kind: "live", backend } : recording ? { kind: "recorded", recording } : { kind: "live", backend };

  const bench = (
    <div className="foundry-bench">
      <div className="foundry-bench__controls">
        <fieldset className="rule-plates">
          <legend className="kicker">{t("trainer.corpus")}</legend>
          {Object.values(chapter.corpus).map((id) => (
            <label key={id} className={`rule-plate${id === corpusId ? " is-chosen" : ""}`}>
              <input type="radio" name="corpus" checked={id === corpusId} disabled={running} onChange={() => {
                  reset();
                  setCorpusId(id);
                }} />
              {t(`trainer.corpora.${id}` as MessageKey, { count: findCorpus(id)?.lines.length ?? 0 })}
            </label>
          ))}
        </fieldset>
        <fieldset className="rule-plates">
          <legend className="kicker">{t("trainer.where")}</legend>
          {(["recorded", "live"] as const).map((m) => (
            <label key={m} className={`rule-plate${m === mode ? " is-chosen" : ""}`}>
              <input type="radio" name="train-where" checked={m === mode} disabled={running} onChange={() => setMode(m)} data-testid={`where-${m}`} />
              {t(`trainer.modes.${m}` as MessageKey)}
            </label>
          ))}
        </fieldset>
        <p className="note">
          {t("trainer.model", { params: formatNumber(recording?.baseParams ?? 0), layers: chapter.config.shape.layers, dim: chapter.config.shape.dim, block: chapter.config.shape.block })}
        </p>
      </div>

      <div className="actions actions--row">
        <button
          className="button button--primary"
          disabled={running || (measuring && guess === null) || (mode === "recorded" && !recording)}
          onClick={() => (mode === "live" ? void trainLive() : recording && replay(recording))}
          data-testid="cast"
        >
          {running ? t("trainer.casting") : t("trainer.cast", { steps: formatNumber(chapter.steps) })}
        </button>
        {running && mode === "live" && (
          <button className="button" onClick={stopLive}>
            {t("trainer.stop")}
          </button>
        )}
        <p className="note" data-testid="trainer-source">
          {source.kind === "recorded"
            ? t("trainer.sourceRecorded", { machine: source.recording.machine, backend: source.recording.backend, date: source.recording.recordedAt, seconds: formatNumber(Math.round((source.recording.points.at(-1)?.elapsedMs ?? 0) / 1000)) })
            : t("trainer.sourceLive", { backend: source.backend ?? "…", seconds: formatNumber(Math.round(elapsed / 1000)) })}
        </p>
        {failure && <p className="error-line">{failure}</p>}
      </div>

      <LossChart points={points} steps={chapter.steps} lowest={lowest} stops={chapter.stops} />

      <div className="foundry-bench__columns">
        <section>
          <span className="kicker">{t("trainer.samples")}</span>
          <ol className="sample-log" data-testid="sample-log">
            {log.map((entry) => (
              <li key={entry.step}>
                <span className="sample-log__step">{formatNumber(entry.step)}</span>
                <SampleLines samples={entry.samples} />
              </li>
            ))}
          </ol>
        </section>
        <section>
          <span className="kicker">{t("trainer.stops", { count: chapter.sampleCount })}</span>
          {stops.map((stop) => (
            <div key={stop.step} className="stop-sheet" data-testid={`stop-${stop.step}`}>
              <p className="stop-sheet__head">
                {t("trainer.stopHead", { step: formatNumber(stop.step), copied: stop.samples.filter((s) => s.kind === "copied").length, total: stop.samples.length })}
              </p>
              <SampleLines samples={stop.samples} />
            </div>
          ))}
          {stops.length === 0 && <p className="note">{t("trainer.stopsEmpty")}</p>}
        </section>
      </div>

      {measuring && (
        <section className="measure-sheet" data-testid="measure">
          <label className="prediction__number">
            <span>{t("trainer.predict", { count: chapter.sampleCount, steps: formatNumber(chapter.steps) })}</span>
            <input
              type="number"
              min={0}
              max={chapter.sampleCount}
              value={guess ?? ""}
              data-testid="predict-copied"
              onChange={(e) => updateChapter(chapter.id, { predictions: { ...progress.predictions, copied: Math.max(0, Math.min(chapter.sampleCount, Math.round(Number(e.target.value)))) } })}
            />
          </label>
          {guess !== null && last && (
            <p className="measure-sheet__finding" data-testid="trainer-finding">
              {t("trainer.finding", { guess, actual: last.samples.filter((s) => s.kind === "copied").length, total: last.samples.length, low: formatNumber(lowest?.step ?? 0) })}
            </p>
          )}
        </section>
      )}
    </div>
  );

  const canAdvance = progress.stage === "bench" ? points.length > 0 : progress.stage === "measure" ? guess !== null && last !== undefined : true;
  return frame(canAdvance, bench);
}

function SampleLines({ samples }: { samples: readonly Sample[] }) {
  const { t } = useI18n();
  return (
    <ul className="sample-lines">
      {samples.map((s, i) => (
        <li key={i} className={`sample-line is-${s.kind}`}>
          <span>{s.text}</span>
          {s.kind !== "new" && <span className="sample-line__mark">{t(`trainer.kinds.${s.kind}` as MessageKey)}</span>}
        </li>
      ))}
    </ul>
  );
}
