import { useState } from "react";
import type { BillChapter as BillContent } from "../../content/schema";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import { priceTable } from "../../llm/pricing";
import { dailyBill, replySeconds, type Breakdown, type Routing, type Traffic } from "../../sim/bill";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";

type Props = { readonly chapter: BillContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };
const trafficKeys: (keyof Traffic)[] = ["conversationsPerDay", "turnsPerConversation", "systemTokens", "contextTokens", "userTokens", "outputTokens"];
const parts: (keyof Breakdown)[] = ["input", "cacheWrites", "cacheReads", "output"];

export function BillChapter({ chapter, progress, frame }: Props) {
  const { t, formatNumber } = useI18n();
  const { updateChapter } = useCourse();
  const [traffic, setTraffic] = useState<Traffic>(chapter.traffic);
  const [routing, setRouting] = useState<Routing>(chapter.routing);
  const cheap = priceTable.models.find((m) => m.model === chapter.cheap);
  const strong = priceTable.models.find((m) => m.model === chapter.strong);
  if (!cheap || !strong) return frame(false, <p className="error-line">{t("evals.empty")}</p>);

  const bill = dailyBill(traffic, cheap, strong, routing);
  const baseline = dailyBill(chapter.traffic, cheap, strong, chapter.routing);
  const month = bill.totalPerDay * chapter.daysPerMonth;
  const baselineMonth = baseline.totalPerDay * chapter.daysPerMonth;
  const usd = (n: number) => t("bill.usd", { amount: n < 10 ? n.toFixed(2) : formatNumber(Math.round(n)) });
  const guess = typeof progress.predictions.bracket === "number" ? progress.predictions.bracket : null;
  const measuring = progress.stage === "measure" || progress.stage === "debrief";
  const hardCovered = routing.strongShare >= chapter.hardShare - 1e-9;
  const underBudget = month <= chapter.budgetUsdPerMonth;
  const actualBracket = chapter.brackets.findIndex((b) => baselineMonth < b);
  const bracketOf = actualBracket === -1 ? chapter.brackets.length : actualBracket;
  const bracketLabel = (i: number) =>
    i === 0 ? t("bill.under", { amount: usd(chapter.brackets[0] ?? 0) }) : i === chapter.brackets.length ? t("bill.over", { amount: usd(chapter.brackets.at(-1) ?? 0) }) : t("bill.between", { low: usd(chapter.brackets[i - 1] ?? 0), high: usd(chapter.brackets[i] ?? 0) });
  const widest = Math.max(...parts.map((p) => bill.perDay[p]), 1e-9);

  const bench = (
    <div className="commission-bench bill-bench">
      <div className="bill-bench__inputs">
        <fieldset className="bill-fields">
          <legend className="kicker">{t("bill.traffic")}</legend>
          {trafficKeys.map((k) => (
            <label key={k}>
              <span>{t(`bill.fields.${k}` as MessageKey)}</span>
              <input type="number" min={0} value={traffic[k]} onChange={(e) => setTraffic((x) => ({ ...x, [k]: Math.max(0, Number(e.target.value) || 0) }))} data-testid={`field-${k}`} />
            </label>
          ))}
        </fieldset>
        <fieldset className="bill-fields">
          <legend className="kicker">{t("bill.routing")}</legend>
          <label>
            <span>{t("bill.strongShare", { strong: strong.label, cheap: cheap.label, share: Math.round(routing.strongShare * 100) })}</span>
            <input type="range" min={0} max={100} step={5} value={Math.round(routing.strongShare * 100)} onChange={(e) => setRouting((r) => ({ ...r, strongShare: Number(e.target.value) / 100 }))} data-testid="strong-share" />
          </label>
          <p className={`note${hardCovered ? "" : " error-line"}`}>{t(hardCovered ? "bill.hardCovered" : "bill.hardDropped", { share: Math.round(chapter.hardShare * 100) })}</p>
          <label className={`rule-plate${routing.caching ? " is-chosen" : ""}`}>
            <input type="checkbox" checked={routing.caching} onChange={(e) => setRouting((r) => ({ ...r, caching: e.target.checked }))} data-testid="caching" />
            {t("bill.caching")}
          </label>
          {routing.caching && (
            <label>
              <span>{t("bill.hitRate", { rate: Math.round(routing.cacheHitRate * 100) })}</span>
              <input type="range" min={0} max={100} step={5} value={Math.round(routing.cacheHitRate * 100)} onChange={(e) => setRouting((r) => ({ ...r, cacheHitRate: Number(e.target.value) / 100 }))} />
            </label>
          )}
        </fieldset>
      </div>

      <section className="bill-sheet" data-testid="bill-sheet">
        <p className="bill-sheet__total" data-testid="bill-month">
          {t("bill.month", { month: usd(month), mxn: formatNumber(Math.round(month * chapter.mxnPerUsd)), day: usd(bill.totalPerDay), conversation: (bill.perConversation * 100).toFixed(2) })}
        </p>
        <ul className="bill-bars">
          {parts.map((p) => (
            <li key={p}>
              <span>{t(`bill.parts.${p}` as MessageKey)}</span>
              <span className="bill-bars__bar" style={{ width: `${(100 * bill.perDay[p]) / widest}%` }} />
              <span>{usd(bill.perDay[p] * chapter.daysPerMonth)}</span>
            </li>
          ))}
        </ul>
        <p className="note">
          {t("bill.latency", {
            cheap: cheap.label,
            strong: strong.label,
            cheapSeconds: replySeconds(chapter.latency[chapter.cheap] ?? { firstTokenMs: 0, tokensPerSecond: 1 }, traffic.outputTokens).toFixed(1),
            strongSeconds: replySeconds(chapter.latency[chapter.strong] ?? { firstTokenMs: 0, tokensPerSecond: 1 }, traffic.outputTokens).toFixed(1),
          })}
        </p>
        <p className="note">{t("bill.prices", { date: priceTable.asOf, cacheDate: priceTable.cacheCheckedAt })}</p>
      </section>

      {measuring && (
        <section className="measure-sheet" data-testid="measure">
          <fieldset className="rule-plates">
            <legend className="kicker">{t("bill.predict", { model: strong.label, conversations: formatNumber(chapter.traffic.conversationsPerDay) })}</legend>
            {Array.from({ length: chapter.brackets.length + 1 }, (_, i) => (
              <label key={i} className={`rule-plate${guess === i ? " is-chosen" : ""}`}>
                <input type="radio" name="bill-bracket" checked={guess === i} onChange={() => updateChapter(chapter.id, { predictions: { ...progress.predictions, bracket: i } })} />
                {bracketLabel(i)}
              </label>
            ))}
          </fieldset>
          {guess !== null && (
            <>
              <p className="measure-sheet__finding" data-testid="bill-finding">
                {t(guess === bracketOf ? "bill.findingMatch" : "bill.findingMiss", { baseline: usd(baselineMonth), budget: usd(chapter.budgetUsdPerMonth), share: Math.round(chapter.hardShare * 100) })}
              </p>
              <p className={underBudget && hardCovered ? "measure-sheet__finding" : "note"} data-testid="bill-target">
                {underBudget && hardCovered ? t("bill.met", { month: usd(month), saved: Math.round(100 * (1 - month / baselineMonth)) }) : t("bill.notYet", { month: usd(month) })}
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );

  const canAdvance = progress.stage === "measure" ? guess !== null && underBudget && hardCovered : true;
  return frame(canAdvance, bench);
}
