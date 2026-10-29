import { useEffect, useState } from "react";
import type { FailureChapter as FailureContent } from "../../content/schema";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import { none, only, safeguards, simulateFailure, type Design, type FailureOutcome, type Safeguard } from "../../sim/failure";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";

type Props = { readonly chapter: FailureContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };
const outcomeKeys: (keyof FailureOutcome)[] = ["harm", "abandoned", "toPerson", "caught", "undone", "extraSteps"];

export function FailureChapter({ chapter, progress, frame }: Props) {
  const { t, formatNumber } = useI18n();
  const { updateChapter } = useCourse();
  const [design, setDesign] = useState<Design>(none);
  const [runs, setRuns] = useState<{ design: Design; outcome: FailureOutcome }[]>([]);
  const guess = typeof progress.predictions.safeguard === "string" ? progress.predictions.safeguard : null;
  const measuring = progress.stage === "measure" || progress.stage === "debrief";
  const baseline = simulateFailure(chapter.model, none);
  const singles = measuring && guess ? safeguards.map((s) => ({ s, outcome: simulateFailure(chapter.model, only(s)) })) : [];
  const streaming = simulateFailure(chapter.model, only("streaming"));
  const harmShare = (o: FailureOutcome) => `${Math.round((100 * o.harm) / Math.max(1, chapter.model.conversations - o.abandoned))}%`;
  const bestSingle = singles.reduce<{ s: Safeguard; outcome: FailureOutcome } | null>((a, x) => (!a || x.outcome.harm < a.outcome.harm ? x : a), null);

  const run = () => setRuns((r) => [{ design, outcome: simulateFailure(chapter.model, design) }, ...r].slice(0, 4));

  const bench = (
    <div className="commission-bench">
      <fieldset className="rule-plates">
        <legend className="kicker">{t("failure.design")}</legend>
        {safeguards.map((s) => (
          <label key={s} className={`rule-plate${design[s] ? " is-chosen" : ""}`}>
            <input type="checkbox" checked={design[s]} onChange={(e) => setDesign((d) => ({ ...d, [s]: e.target.checked }))} data-testid={`safeguard-${s}`} />
            {t(`failure.safeguards.${s}` as MessageKey)}
          </label>
        ))}
      </fieldset>

      <ReplyPreview chapter={chapter} design={design} />

      <details className="assumptions">
        <summary className="kicker">{t("commission.assumptions")}</summary>
        <ul>
          {chapter.assumptions.map((a) => {
            const value = chapter.model[a.key as keyof FailureContent["model"]];
            const shown = Array.isArray(value) ? value.join("–") : typeof value === "number" && value <= 1 ? `${Math.round(value * 100)}%` : String(value);
            return (
              <li key={a.key}>
                {t(`failure.assumptions.${a.key}` as MessageKey, { value: shown })}{" "}
                <span className="feature-table__evidence">
                  {a.evidence === "assumption"
                    ? t("features.assumed")
                    : a.of && typeof value === "number"
                      ? t("failure.measuredOf", { count: Math.round(value * a.of), of: a.of, chapter: t(`chapters.${a.evidence}.title` as MessageKey) })
                      : t("features.measured", { chapter: t(`chapters.${a.evidence}.title` as MessageKey) })}
                </span>
              </li>
            );
          })}
        </ul>
      </details>

      <fieldset className="rule-plates" disabled={runs.length > 0} data-testid="predict">
        <legend className="kicker">{t("failure.predict")}</legend>
        {safeguards.map((s) => (
          <label key={s} className={`rule-plate${guess === s ? " is-chosen" : ""}`}>
            <input type="radio" name="best-safeguard" checked={guess === s} onChange={() => updateChapter(chapter.id, { predictions: { ...progress.predictions, safeguard: s } })} />
            {t(`failure.safeguards.${s}` as MessageKey)}
          </label>
        ))}
      </fieldset>

      <div className="actions actions--row">
        <button className="button button--primary" disabled={guess === null} onClick={run} data-testid="run-conversations">
          {t("failure.run", { count: formatNumber(chapter.model.conversations) })}
        </button>
      </div>

      {runs.length > 0 && (
        <table className="galley-table" data-testid="failure-ledger">
          <thead>
            <tr>
              <th>{t("failure.designColumn")}</th>
              {outcomeKeys.map((k) => (
                <th key={k}>{t(`failure.outcomes.${k}` as MessageKey)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{t("failure.noSafeguards")}</td>
              {outcomeKeys.map((k) => (
                <td key={k}>{formatNumber(baseline[k])}</td>
              ))}
            </tr>
            {runs.map((r, i) => (
              <tr key={i} className={i === 0 ? "is-latest" : ""}>
                <td>{safeguards.filter((s) => r.design[s]).map((s) => t(`failure.safeguards.${s}` as MessageKey)).join(", ") || t("failure.noSafeguards")}</td>
                {outcomeKeys.map((k) => (
                  <td key={k} className={k === "harm" ? "is-key" : ""}>
                    {formatNumber(r.outcome[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {measuring && (
        <section className="measure-sheet" data-testid="measure">
          {bestSingle && (
            <>
              <table className="galley-table" data-testid="singles">
                <thead>
                  <tr>
                    <th>{t("failure.alone")}</th>
                    <th>{t("failure.outcomes.harm")}</th>
                    <th>{t("failure.outcomes.abandoned")}</th>
                    <th>{t("failure.outcomes.toPerson")}</th>
                  </tr>
                </thead>
                <tbody>
                  {singles.map(({ s, outcome }) => (
                    <tr key={s}>
                      <td>{t(`failure.safeguards.${s}` as MessageKey)}</td>
                      <td>
                        {formatNumber(baseline.harm)} → {formatNumber(outcome.harm)}
                      </td>
                      <td>{formatNumber(outcome.abandoned)}</td>
                      <td>{formatNumber(outcome.toPerson)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="measure-sheet__finding" data-testid="failure-finding">
                {t(guess === bestSingle.s ? "failure.findingMatch" : "failure.findingMiss", {
                  best: t(`failure.safeguards.${bestSingle.s}` as MessageKey),
                  from: formatNumber(baseline.harm),
                  to: formatNumber(bestSingle.outcome.harm),
                  streaming: formatNumber(streaming.harm),
                  kept: formatNumber(baseline.abandoned - streaming.abandoned),
                  before: harmShare(baseline),
                  after: harmShare(streaming),
                })}
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );

  const canAdvance = progress.stage === "bench" ? runs.length > 0 && guess !== null : true;
  return frame(canAdvance, bench);
}

// The same wrong answer, set under the learner's design.
function ReplyPreview({ chapter, design }: { chapter: FailureContent; design: Design }) {
  const { t, locale } = useI18n();
  const full = design.refusal ? (chapter.sample.refusal[locale] ?? "") : (chapter.sample.reply[locale] ?? "");
  const [shown, setShown] = useState(full.length);

  useEffect(() => {
    if (!design.streaming || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let n = 0;
    const id = window.setInterval(() => {
      n = Math.min(full.length, n + 3);
      setShown(n);
      if (n >= full.length) window.clearInterval(id);
    }, 30);
    return () => window.clearInterval(id);
  }, [design.streaming, full]);

  const text = design.streaming ? full.slice(0, shown) : full;
  return (
    <section className="reply-preview" data-testid="reply-preview">
      <span className="kicker">{t("failure.preview")}</span>
      <p className="reply-preview__customer">{chapter.sample.customer[locale]}</p>
      <div className="slip slip--reply">
        <p>{text}</p>
        {design.uncertainty && !design.refusal && <p className="reply-preview__unsure">{t("failure.unsureNote")}</p>}
        {!design.refusal && design.lastWord && (
          <div className="actions actions--row">
            <span className="button button--primary" aria-hidden="true">
              {t("failure.confirm")}
            </span>
            <span className="button" aria-hidden="true">
              {t("failure.notNow")}
            </span>
          </div>
        )}
        {!design.refusal && !design.lastWord && <p className="reply-preview__done">{t("failure.done")}</p>}
        {!design.refusal && design.undo && <p className="reply-preview__undo">{t("failure.undo")}</p>}
      </div>
    </section>
  );
}
