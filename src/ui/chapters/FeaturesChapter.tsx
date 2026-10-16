import { useMemo, useState } from "react";
import type { FeaturesChapter as FeaturesContent } from "../../content/schema";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import { costUsd, listedPrice } from "../../llm/pricing";
import { approaches, cheapestPlan, simulateFeature, type Approach, type FeatureSpec, type Outcome } from "../../sim/features";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";

type Props = { readonly chapter: FeaturesContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };

export function FeaturesChapter({ chapter, progress, frame }: Props) {
  const { t, locale, formatNumber } = useI18n();
  const { updateChapter } = useCourse();
  const [plan, setPlan] = useState<Record<string, Approach>>(() => Object.fromEntries(chapter.features.map((f) => [f.id, "llm" as Approach])));
  const [ran, setRan] = useState<Record<string, Outcome> | null>(null);

  // API cost per request comes from the dated price table and each approach's token counts.
  const specs = useMemo<FeatureSpec[]>(
    () =>
      chapter.features.map((f) => ({
        ...f,
        approaches: Object.fromEntries(
          approaches.map((a) => {
            const spec = f.approaches[a];
            const price = spec.tokens ? listedPrice(spec.tokens.model) : null;
            return [a, { ...spec, apiUsdPerRequest: price && spec.tokens ? costUsd(price, spec.tokens.input, spec.tokens.output) : 0 }];
          }),
        ) as unknown as FeatureSpec["approaches"],
      })),
    [chapter.features],
  );

  const run = () => setRan(Object.fromEntries(specs.map((f) => [f.id, simulateFeature(f, plan[f.id] ?? "rules", chapter.economics)])));
  const totals = ran ? Object.values(ran).reduce((s, o) => ({ api: s.api + o.apiMxn, person: s.person + o.personMxn, wrong: s.wrong + o.wrongMxn }), { api: 0, person: 0, wrong: 0 }) : null;
  const best = useMemo(() => (ran ? cheapestPlan(specs, chapter.economics) : null), [ran, specs, chapter.economics]);
  const guess = typeof progress.predictions.llmCount === "number" ? progress.predictions.llmCount : null;
  const measuring = progress.stage === "measure" || progress.stage === "debrief";
  const mxn = (n: number) => t("commission.mxn", { amount: formatNumber(Math.round(n)) });
  const bestLlm = best ? Object.values(best.plan).filter((a) => a === "llm").length : 0;

  const bench = (
    <div className="commission-bench">
      <p className="note">{t("features.economics", { rate: chapter.economics.mxnPerUsd, wage: chapter.economics.personMxnPerHour, weeks: chapter.economics.weeks })}</p>
      <table className="galley-table feature-table" data-testid="feature-table">
        <thead>
          <tr>
            <th>{t("features.feature")}</th>
            {approaches.map((a) => (
              <th key={a}>{t(`features.approaches.${a}` as MessageKey)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {chapter.features.map((f) => (
            <tr key={f.id}>
              <td>
                <strong>{f.text[locale]}</strong>
                <span className="feature-table__volume">{t("features.volume", { count: formatNumber(f.weeklyRequests) })}</span>
              </td>
              {approaches.map((a) => {
                const spec = f.approaches[a];
                const chosen = plan[f.id] === a;
                return (
                  <td key={a} className={chosen ? "is-chosen" : ""}>
                    <label className={`rule-plate rule-plate--small${chosen ? " is-chosen" : ""}`}>
                      <input type="radio" name={`plan-${f.id}`} checked={chosen} onChange={() => {
                          setPlan((p) => ({ ...p, [f.id]: a }));
                          setRan(null);
                        }} data-testid={`plan-${f.id}-${a}`} />
                      {t(`features.approaches.${a}` as MessageKey)}
                    </label>
                    <span className="feature-table__numbers">
                      {t("features.numbers", { coverage: Math.round(spec.coverage * 100), accuracy: Math.round(spec.accuracy * 100), latency: formatNumber(spec.latencyMs) })}
                    </span>
                    <span className="feature-table__why">{spec.why[locale]}</span>
                    <span className="feature-table__evidence">{spec.evidence === "assumption" ? t("features.assumed") : t("features.measured", { chapter: t(`chapters.${spec.evidence}.title` as MessageKey) })}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="actions actions--row">
        <button className="button button--primary" disabled={measuring && guess === null} onClick={run} data-testid="run-month">
          {t("features.run", { weeks: chapter.economics.weeks })}
        </button>
      </div>

      {ran && totals && (
        <section className="month-ledger" data-testid="month-ledger">
          <table className="galley-table">
            <thead>
              <tr>
                <th>{t("features.feature")}</th>
                <th>{t("features.right")}</th>
                <th>{t("features.wrong")}</th>
                <th>{t("features.toPerson")}</th>
                <th>{t("features.api")}</th>
                <th>{t("features.people")}</th>
                <th>{t("features.wrongCost")}</th>
              </tr>
            </thead>
            <tbody>
              {chapter.features.map((f) => {
                const o = ran[f.id];
                if (!o) return null;
                return (
                  <tr key={f.id}>
                    <td>
                      {f.text[locale]} · {t(`features.approaches.${plan[f.id] ?? "rules"}` as MessageKey)}
                    </td>
                    <td>{formatNumber(o.right)}</td>
                    <td>{formatNumber(o.wrong)}</td>
                    <td>{formatNumber(o.toPerson)}</td>
                    <td>{mxn(o.apiMxn)}</td>
                    <td>{mxn(o.personMxn)}</td>
                    <td>{mxn(o.wrongMxn)}</td>
                  </tr>
                );
              })}
              <tr className="month-ledger__total">
                <td colSpan={4}>{t("features.total", { amount: mxn(totals.api + totals.person + totals.wrong) })}</td>
                <td>{mxn(totals.api)}</td>
                <td>{mxn(totals.person)}</td>
                <td>{mxn(totals.wrong)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {measuring && (
        <section className="measure-sheet" data-testid="measure">
          <fieldset className="rule-plates">
            <legend className="kicker">{t("features.predict", { count: chapter.features.length })}</legend>
            {Array.from({ length: chapter.features.length + 1 }, (_, n) => (
              <label key={n} className={`rule-plate${guess === n ? " is-chosen" : ""}`}>
                <input type="radio" name="llm-count" checked={guess === n} onChange={() => updateChapter(chapter.id, { predictions: { ...progress.predictions, llmCount: n } })} />
                {formatNumber(n)}
              </label>
            ))}
          </fieldset>
          {ran && best && guess !== null && totals && (
            <p className="measure-sheet__finding" data-testid="features-finding">
              {t("features.finding", {
                guess,
                actual: bestLlm,
                plan: chapter.features.map((f) => `${f.text[locale]}: ${t(`features.approaches.${best.plan[f.id] ?? "rules"}` as MessageKey)}`).join("; "),
                best: mxn(best.totalMxn),
                yours: mxn(totals.api + totals.person + totals.wrong),
              })}
            </p>
          )}
        </section>
      )}
    </div>
  );

  const canAdvance = progress.stage === "bench" ? ran !== null : progress.stage === "measure" ? ran !== null && guess !== null : true;
  return frame(canAdvance, bench);
}
