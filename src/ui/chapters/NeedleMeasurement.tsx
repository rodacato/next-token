import { useState } from "react";
import type { StickChapter } from "../../content/schema";
import { localeMeta, type MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import { inferenceClient } from "../../model/client";
import { SHORTLIST } from "../../model/compositor";
import { needleRecordingSchema, type NeedleRecording } from "../../model/experiment-recordings";
import { runNeedle, type NeedleResult } from "../../model/experiments";
import { useCourse } from "../CourseProvider";
import { useCompositor } from "../useCompositor";

const recordingFiles = import.meta.glob("../../recordings/experiments/needle.*.json", { eager: true, import: "default" });
const recordings: readonly NeedleRecording[] = Object.values(recordingFiles).map((raw) => needleRecordingSchema.parse(raw));
const guesses = ["start", "middle", "end", "same"] as const;

type Series = { readonly locale: string; readonly results: readonly NeedleResult[]; readonly label: string };

type Props = {
  readonly chapter: StickChapter;
  readonly guess: string | undefined;
  readonly onGuess: (guess: string) => void;
  readonly onMeasured: () => void;
};

export function NeedleMeasurement({ chapter, guess, onGuess, onMeasured }: Props) {
  const { t, locale } = useI18n();
  const { state } = useCourse();
  const compositor = useCompositor(locale, state.modelId, state.modelOptedIn);
  const [shown, setShown] = useState<Series[] | null>(null);
  const [running, setRunning] = useState(false);

  const recordedSeries = (): Series[] =>
    [...recordings]
      .sort((a, b) => (a.locale === locale ? -1 : b.locale === locale ? 1 : a.locale.localeCompare(b.locale)))
      .map((r) => ({ locale: r.locale, results: r.results, label: t("model.recorded", { model: r.model, date: r.recordedAt }) }));

  const showRecorded = () => {
    setShown(recordedSeries());
    onMeasured();
  };

  const runLive = async () => {
    setRunning(true);
    try {
      const [answer] = await inferenceClient().tokenize(state.modelId, chapter.needle.answer);
      if (!answer) return;
      const results = await runNeedle(chapter, locale, answer.tokenId, (context) => inferenceClient().nextToken(context, SHORTLIST));
      const source = compositor.state.status === "live" ? compositor.state.compositor.source : null;
      const label = source?.kind === "live" ? t("model.ready", { name: source.model, device: t(`model.device.${source.device}`) }) : "";
      setShown([{ locale, results, label }, ...recordedSeries().filter((s) => s.locale !== locale)]);
      onMeasured();
    } finally {
      setRunning(false);
    }
  };

  const facts = chapter.needle.haystack[locale]?.length ?? 0;
  return (
    <section className="measure-sheet" data-testid="measure">
      <h3 className="measure-sheet__heading">{t("needle.heading")}</h3>
      <p>{t("needle.body", { count: facts })}</p>
      <fieldset className="prediction" disabled={shown !== null}>
        <legend className="kicker">{t("needle.predict")}</legend>
        {guesses.map((option) => (
          <label key={option} className={`prediction__option${guess === option ? " is-chosen" : ""}`}>
            <input type="radio" name="needle-guess" value={option} checked={guess === option} onChange={() => onGuess(option)} />
            {t(`needle.options.${option}` as MessageKey)}
          </label>
        ))}
      </fieldset>
      {!shown && (
        <div className="actions actions--row">
          <button className="button button--primary" disabled={!guess || recordings.length === 0} onClick={showRecorded} data-testid="run-measure">
            {t("needle.run")}
          </button>
          {compositor.state.status === "live" && (
            <button className="button button--press" disabled={!guess || running} onClick={() => void runLive()}>
              {running ? t("model.thinking") : t("needle.runLive")}
            </button>
          )}
        </div>
      )}
      {shown && guess && <NeedleChart series={shown} guess={t(`needle.options.${guess}` as MessageKey)} />}
    </section>
  );
}

function NeedleChart({ series, guess }: { series: readonly Series[]; guess: string }) {
  const { t, formatNumber } = useI18n();
  const percent = (p: number) => formatNumber(p, { style: "percent", maximumFractionDigits: 1 });
  const depthLabel = (d: number) => formatNumber(d, { style: "percent", maximumFractionDigits: 0 });
  const [own] = series;
  if (!own) return null;
  const width = 680;
  const height = 220;
  const depths = own.results.map((r) => r.depth);
  const max = Math.max(...series.flatMap((s) => s.results.map((r) => r.probability)), 0.01);
  const lowest = own.results.reduce((a, b) => (b.probability < a.probability ? b : a));
  const group = width / depths.length;
  const barWidth = (group * 0.7) / series.length;

  return (
    <figure className="needle-chart" data-testid="needle-chart">
      <div className="needle-chart__legend">
        {series.map((s, i) => (
          <span key={s.locale} className={`needle-chart__key needle-chart__key--${i === 0 ? "own" : "other"}`}>
            {localeMeta(s.locale).name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height + 40}`} role="img" aria-label={t("needle.heading")}>
        <line x1="0" x2={width} y1={height} y2={height} stroke="var(--ink)" />
        {depths.map((depth, i) => (
          <g key={depth}>
            {series.map((s, j) => {
              const result = s.results[i];
              if (!result) return null;
              const h = Math.max(1, (result.probability / max) * (height - 26));
              const x = i * group + group * 0.15 + j * barWidth;
              const fill = j > 0 ? "var(--slate-light)" : result === lowest ? "var(--vermilion)" : "var(--brass)";
              return (
                <g key={s.locale}>
                  <rect x={x} y={height - h} width={barWidth - 2} height={h} fill={fill} stroke={j > 0 ? "var(--slate)" : "var(--brass-dark)"} />
                  {j === 0 && (
                    <text x={x + barWidth / 2} y={height - h - 6} textAnchor="middle" className="needle-chart__value">
                      {percent(result.probability)}
                    </text>
                  )}
                </g>
              );
            })}
            <text x={i * group + group / 2} y={height + 16} textAnchor="middle" className="needle-chart__depth">
              {depthLabel(depth)}
            </text>
          </g>
        ))}
        <text x="0" y={height + 36} className="needle-chart__depth">
          {t("needle.depth")}: 0% = {t("needle.start")} · 100% = {t("needle.end")}
        </text>
      </svg>
      <figcaption>
        <p className="needle-chart__finding" data-testid="needle-finding">
          {t("needle.lowest", { depth: depthLabel(lowest.depth), probability: percent(lowest.probability), guess })}
        </p>
        <p className="note">
          {t("needle.contextSize", { tokens: formatNumber(lowest.contextTokens) })} {own.label}
        </p>
        {series.length > 1 && <p className="note">{t("needle.languages")}</p>}
        <p className="note">{t("needle.caveat")}</p>
      </figcaption>
    </figure>
  );
}
