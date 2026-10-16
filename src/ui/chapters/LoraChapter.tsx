import { useEffect, useRef, useState } from "react";
import { findCorpus } from "../../content";
import type { LoraChapter as LoraContent } from "../../content/schema";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import { TrainerClient } from "../../trainer/client";
import { splitCorpus } from "../../trainer/corpus";
import type { Checkpoint } from "../../trainer/model";
import type { LossPoint, Sample } from "../../trainer/session";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";
import { LoraArithmetic } from "./LoraArithmetic";
import { LossChart } from "./LossChart";

type Props = { readonly chapter: LoraContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };
type AdapterRun = {
  readonly rank: number;
  readonly loraParams: number;
  readonly baseParams: number;
  readonly points: readonly LossPoint[];
  readonly adapter: { fingerprintBefore: string; fingerprintAfter: string; withAdapter: Sample[]; withoutAdapter: Sample[] };
};
type Recording = { recordedAt: string; machine: string; backend: string; ranks: AdapterRun[] };
const recordings = import.meta.glob("../../recordings/trainer/lora-*.json", { import: "default" });
const bases = import.meta.glob("../../recordings/trainer/*-base.json", { import: "default" });
const priced = (samples: readonly Sample[]) => samples.filter((s) => /\bMXN\b/.test(s.text)).length;

export function LoraChapter({ chapter, progress, frame }: Props) {
  const { t, locale, formatNumber } = useI18n();
  const { updateChapter } = useCourse();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [rank, setRank] = useState(chapter.adapter.ranks.at(-1) ?? 16);
  const [mode, setMode] = useState<"recorded" | "live">("recorded");
  const [runs, setRuns] = useState<Record<number, AdapterRun>>({});
  const [points, setPoints] = useState<LossPoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [showAdapter, setShowAdapter] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const client = useRef<TrainerClient | null>(null);
  const baseId = chapter.base.corpus[locale] ?? "";
  const adapterId = chapter.adapter.corpus[locale] ?? "";

  useEffect(() => {
    let alive = true;
    void recordings[`../../recordings/trainer/lora-${locale}.json`]?.().then((raw) => alive && setRecording(raw as Recording));
    return () => {
      alive = false;
    };
  }, [locale]);

  useEffect(() => () => client.current?.terminate(), []);

  const replay = (r: number) => {
    const run = recording?.ranks.find((x) => x.rank === r);
    if (!run) return;
    setPoints([...run.points]);
    setRuns((all) => ({ ...all, [r]: run }));
  };

  // Live: the shipped base checkpoint goes into the worker, and only the adapter is handed to the optimiser.
  const trainLive = async (r: number) => {
    const taglines = findCorpus(adapterId);
    const loadBase = bases[`../../recordings/trainer/${baseId}-base.json`];
    if (!taglines || !loadBase) return;
    setBusy(true);
    setFailure(null);
    setPoints([]);
    client.current?.terminate();
    const worker = new TrainerClient();
    client.current = worker;
    try {
      const { checkpoint } = (await loadBase()) as { checkpoint: Checkpoint };
      const { train, val } = splitCorpus(taglines.lines, 0.1, 11);
      worker.listen((m) => m.type === "progress" && setPoints((ps) => [...ps, { step: m.step, train: m.train, val: m.val }]));
      worker.send({ type: "init", config: { shape: checkpoint.shape, batch: 32, learningRate: chapter.adapter.learningRate, seed: 11, valShare: 0.1 }, train, val, base: checkpoint, lora: { rank: r, alpha: r * chapter.adapter.alphaPerRank } });
      const ready = await worker.once("ready");
      worker.send({ type: "fingerprint" });
      const fingerprintBefore = (await worker.once("fingerprint")).value;
      const collected: LossPoint[] = [];
      const stop = worker.listen((m) => m.type === "progress" && collected.push({ step: m.step, train: m.train, val: m.val }));
      worker.send({ type: "train", steps: chapter.adapter.steps, every: chapter.every, sampleEvery: 1000, temperature: chapter.temperature });
      await worker.once("stopped");
      stop();
      worker.send({ type: "fingerprint" });
      const fingerprintAfter = (await worker.once("fingerprint")).value;
      const sample = async (loraOn: boolean) => {
        worker.send({ type: "sample", count: chapter.sampleCount, temperature: chapter.temperature, seed: chapter.sampleSeed, loraOn });
        return [...(await worker.once("samples")).samples];
      };
      const run = { rank: r, loraParams: ready.loraParams, baseParams: ready.baseParams, points: collected, adapter: { fingerprintBefore, fingerprintAfter, withAdapter: await sample(true), withoutAdapter: await sample(false) } };
      setRuns((all) => ({ ...all, [r]: run }));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const current = runs[rank];
  const guess = typeof progress.predictions.rank === "number" ? progress.predictions.rank : null;
  const measuring = progress.stage === "measure" || progress.stage === "debrief";
  const allRanks = chapter.adapter.ranks.every((r) => runs[r]);
  const half = Math.ceil(chapter.sampleCount / 2);
  const smallest = chapter.adapter.ranks.find((r) => runs[r] && priced(runs[r].adapter.withAdapter) >= half) ?? 0;

  const bench = (
    <div className="plate-bench">
      <LoraArithmetic real={chapter.real} />

      <section className="plate-bench__run">
        <span className="kicker">{t("lora.runHeading")}</span>
        <p className="note">{t("lora.runBody")}</p>
        <fieldset className="rule-plates">
          <legend className="kicker">{t("lora.rank")}</legend>
          {chapter.adapter.ranks.map((r) => (
            <label key={r} className={`rule-plate${r === rank ? " is-chosen" : ""}`}>
              <input type="radio" name="lora-rank" checked={r === rank} disabled={busy} onChange={() => setRank(r)} />
              {t("lora.rankOption", { rank: r })}
            </label>
          ))}
        </fieldset>
        <fieldset className="rule-plates">
          <legend className="kicker">{t("trainer.where")}</legend>
          {(["recorded", "live"] as const).map((m) => (
            <label key={m} className={`rule-plate${m === mode ? " is-chosen" : ""}`}>
              <input type="radio" name="lora-where" checked={m === mode} disabled={busy} onChange={() => setMode(m)} />
              {t(`trainer.modes.${m}` as MessageKey)}
            </label>
          ))}
        </fieldset>
        <div className="actions actions--row">
          <button className="button button--primary" disabled={busy || (mode === "recorded" && !recording)} onClick={() => (mode === "live" ? void trainLive(rank) : replay(rank))} data-testid="train-adapter">
            {busy ? t("lora.training") : t("lora.train", { rank, steps: formatNumber(chapter.adapter.steps) })}
          </button>
          {recording && mode === "recorded" && <p className="note">{t("lora.recorded", { machine: recording.machine, backend: recording.backend, date: recording.recordedAt })}</p>}
          {failure && <p className="error-line">{failure}</p>}
        </div>
      </section>

      {points.length > 0 && <LossChart points={points} steps={chapter.adapter.steps} lowest={null} stops={[]} />}

      {current && (
        <section className="adapter-sheet" data-testid="adapter-sheet">
          <p className="adapter-sheet__counts">
            {t("lora.counts", { lora: formatNumber(current.loraParams), base: formatNumber(current.baseParams), share: ((100 * current.loraParams) / current.baseParams).toFixed(1) })}
          </p>
          <p className="adapter-sheet__fingerprint" data-testid="fingerprint">
            {t(current.adapter.fingerprintBefore === current.adapter.fingerprintAfter ? "lora.untouched" : "lora.touched", { before: current.adapter.fingerprintBefore, after: current.adapter.fingerprintAfter })}
          </p>
          <fieldset className="rule-plates">
            <legend className="kicker">{t("lora.switch")}</legend>
            {[true, false].map((on) => (
              <label key={String(on)} className={`rule-plate${on === showAdapter ? " is-chosen" : ""}`}>
                <input type="radio" name="adapter-on" checked={on === showAdapter} onChange={() => setShowAdapter(on)} data-testid={`adapter-${on ? "on" : "off"}`} />
                {t(on ? "lora.on" : "lora.off")}
              </label>
            ))}
          </fieldset>
          <ul className="sample-lines" data-testid="adapter-samples">
            {(showAdapter ? current.adapter.withAdapter : current.adapter.withoutAdapter).map((s, i) => (
              <li key={i} className="sample-line">
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {measuring && (
        <section className="measure-sheet" data-testid="measure">
          <fieldset className="rule-plates">
            <legend className="kicker">{t("lora.predict", { half, count: chapter.sampleCount })}</legend>
            {[...chapter.adapter.ranks, 0].map((r) => (
              <label key={r} className={`rule-plate${guess === r ? " is-chosen" : ""}`}>
                <input type="radio" name="lora-predict" checked={guess === r} onChange={() => updateChapter(chapter.id, { predictions: { ...progress.predictions, rank: r } })} />
                {r === 0 ? t("lora.none") : t("lora.rankOption", { rank: r })}
              </label>
            ))}
          </fieldset>
          <button className="button" disabled={guess === null || !recording} onClick={() => chapter.adapter.ranks.forEach(replay)} data-testid="all-ranks">
            {t("lora.allRanks")}
          </button>
          {allRanks && (
            <>
              <table className="galley-table" data-testid="rank-table">
                <thead>
                  <tr>
                    <th>{t("lora.rank")}</th>
                    <th>{t("lora.trainable")}</th>
                    <th>{t("lora.withPrice", { count: chapter.sampleCount })}</th>
                  </tr>
                </thead>
                <tbody>
                  {chapter.adapter.ranks.map((r) => (
                    <tr key={r}>
                      <td>{formatNumber(r)}</td>
                      <td>{formatNumber(runs[r]?.loraParams ?? 0)}</td>
                      <td>{formatNumber(priced(runs[r]?.adapter.withAdapter ?? []))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="measure-sheet__finding" data-testid="lora-finding">
                {t(guess === smallest ? "lora.findingMatch" : "lora.findingMiss", { rank: smallest ? t("lora.rankOption", { rank: smallest }) : t("lora.none") })}
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );

  const canAdvance = progress.stage === "bench" ? Object.keys(runs).length > 0 : progress.stage === "measure" ? allRanks && guess !== null : true;
  return frame(canAdvance, bench);
}
