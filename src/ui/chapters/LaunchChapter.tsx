import { useMemo, useState } from "react";
import { findChapter } from "../../content";
import type { LaunchChapter as LaunchContent } from "../../content/schema";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import { priceTable } from "../../llm/pricing";
import { dailyBill } from "../../sim/bill";
import { verdict, type Attack } from "../../sim/injection";
import { simulateLaunch, type LaunchPlan, type LaunchWorld, type Week } from "../../sim/launch";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";

type Props = { readonly chapter: LaunchContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };
type Toggle = "staged" | "budgetCap" | "optimized" | "grounding" | "outputCheck";
const toggles: Toggle[] = ["staged", "budgetCap", "optimized", "grounding", "outputCheck"];
const brackets = [100_000, 500_000, 1_000_000];
const harmfulGoals = new Set(["refund", "exfiltration", "coupon"]);

export function LaunchChapter({ chapter, progress, frame }: Props) {
  const { t, locale, formatNumber } = useI18n();
  const { updateChapter } = useCourse();
  const [plan, setPlan] = useState<Record<Toggle, boolean>>({ ...chapter.defaultPlan });
  const [defenses, setDefenses] = useState<ReadonlySet<string>>(new Set(chapter.defaultPlan.defenses));
  const [result, setResult] = useState<{ weeks: Week[]; pendingMxn: number } | null>(null);
  const attacks = chapter.attacks as readonly Attack[];

  // Cost per conversation comes from chapter 20: as it stood, and with routing and caching.
  const world = useMemo<LaunchWorld | null>(() => {
    const bill = findChapter(chapter.billChapter);
    if (bill?.kind !== "commission-bill") return null;
    const cheap = priceTable.models.find((m) => m.model === bill.cheap);
    const strong = priceTable.models.find((m) => m.model === bill.strong);
    if (!cheap || !strong) return null;
    const as = dailyBill(bill.traffic, cheap, strong, bill.routing).perConversation;
    const optimized = dailyBill(bill.traffic, cheap, strong, { strongShare: bill.hardShare, caching: true, cacheHitRate: bill.routing.cacheHitRate }).perConversation;
    return { ...chapter.world, conversationsPerDay: bill.traffic.conversationsPerDay, usdPerConversation: { default: as, optimized } };
  }, [chapter]);

  if (!world) return frame(false, <p className="error-line">{t("evals.empty")}</p>);
  const fullPlan: LaunchPlan = { ...plan, defenses };
  const run = () => setResult(simulateLaunch(world, fullPlan, attacks));
  const total = result ? result.weeks.reduce((s, w) => s + w.totalMxn, 0) + result.pendingMxn : 0;
  const baseline = simulateLaunch(world, { ...chapter.defaultPlan, defenses: new Set(chapter.defaultPlan.defenses) }, attacks);
  const baselineTotal = baseline.weeks.reduce((s, w) => s + w.totalMxn, 0) + baseline.pendingMxn;
  const guess = typeof progress.predictions.launchBracket === "number" ? progress.predictions.launchBracket : null;
  const measuring = progress.stage === "measure" || progress.stage === "debrief";
  const actualBracket = (() => {
    const i = brackets.findIndex((b) => baselineTotal < b);
    return i === -1 ? brackets.length : i;
  })();
  const harmfulThrough = result ? attacks.filter((a) => harmfulGoals.has(a.goal)).reduce((s, a) => s + result.weeks.reduce((n, w) => n + (w.injections[a.id] ?? 0), 0), 0) : 0;
  const goalMet = result !== null && total < chapter.goalMxn && harmfulThrough === 0;
  const mxn = (n: number) => t("commission.mxn", { amount: formatNumber(Math.round(n)) });
  const bracketLabel = (i: number) => (i === 0 ? t("bill.under", { amount: mxn(brackets[0] ?? 0) }) : i === brackets.length ? t("bill.over", { amount: mxn(brackets.at(-1) ?? 0) }) : t("bill.between", { low: mxn(brackets[i - 1] ?? 0), high: mxn(brackets[i] ?? 0) }));

  const bench = (
    <div className="commission-bench launch-bench">
      <fieldset className="rule-plates">
        <legend className="kicker">{t("launch.plan")}</legend>
        {toggles.map((k) => (
          <label key={k} className={`rule-plate${plan[k] ? " is-chosen" : ""}`}>
            <input type="checkbox" checked={plan[k]} onChange={(e) => setPlan((p) => ({ ...p, [k]: e.target.checked }))} data-testid={`plan-${k}`} />
            {t(`launch.toggles.${k}` as MessageKey, { cap: world.dailyCapUsd })}
          </label>
        ))}
      </fieldset>

      <section className="injection-lab" data-testid="injection-lab">
        <span className="kicker">{t("launch.lab")}</span>
        <div className="injection-lab__defenses">
          {chapter.defenses.map((d) => (
            <label key={d.id} className={`rule-plate rule-plate--small${defenses.has(d.id) ? " is-chosen" : ""}`}>
              <input
                type="checkbox"
                checked={defenses.has(d.id)}
                onChange={(e) =>
                  setDefenses((s) => {
                    const next = new Set(s);
                    if (e.target.checked) next.add(d.id);
                    else next.delete(d.id);
                    return next;
                  })
                }
                data-testid={`defense-${d.id}`}
              />
              {d.text[locale]}
            </label>
          ))}
        </div>
        <ol className="attack-list">
          {chapter.attacks.map((a) => {
            const v = verdict(a as Attack, defenses);
            return (
              <li key={a.id} className={`attack is-${v}`} data-testid={`attack-${a.id}`}>
                <span className="kicker">{t(`launch.vectors.${a.vector}` as MessageKey)} · {t(`launch.goals.${a.goal}` as MessageKey)}</span>
                <p>{a.text[locale]}</p>
                <span className="attack__verdict">{t(`launch.verdicts.${v}` as MessageKey)}</span>
              </li>
            );
          })}
        </ol>
        {measuring && guess !== null && (
          <table className="galley-table injection-matrix" data-testid="injection-matrix">
            <thead>
              <tr>
                <th>{t("launch.attack")}</th>
                {chapter.defenses.map((d) => (
                  <th key={d.id} title={d.text[locale]}>
                    {t(`launch.defenseShort.${d.id}` as MessageKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chapter.attacks.map((a) => (
                <tr key={a.id}>
                  <td>{t(`launch.goals.${a.goal}` as MessageKey)}</td>
                  {chapter.defenses.map((d) => {
                    const e = a.effects[d.id] ?? "none";
                    return (
                      <td key={d.id} className={`effect-${e}`}>
                        {t(`launch.effects.${e}` as MessageKey)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="actions actions--row">
        <button className="button button--primary" disabled={measuring && guess === null} onClick={run} data-testid="run-launch">
          {t("launch.run", { weeks: world.weeks })}
        </button>
        {result && (
          <p className="launch-total" data-testid="launch-total">
            {t("launch.total", { total: mxn(total), api: mxn(result.weeks.reduce((s, w) => s + w.apiUsd, 0) * world.mxnPerUsd) })}
          </p>
        )}
      </div>

      {result && (
        <>
          <div className="week-charts">
            <WeekChart weeks={result.weeks} pending={result.pendingMxn} mxnPerUsd={world.mxnPerUsd} />
            <ApiChart weeks={result.weeks} />
          </div>
          <ol className="launch-log" data-testid="launch-log">
            {result.weeks.map((w) => (
              <li key={w.week}>
                <span className="kicker">{t("launch.week", { week: w.week })}</span>
                <WeekNotes week={w} world={world} chapter={chapter} />
              </li>
            ))}
            {result.pendingMxn > 0 && (
              <li>
                <span className="kicker">{t("launch.after")}</span>
                <p>{t("launch.pending", { amount: mxn(result.pendingMxn) })}</p>
              </li>
            )}
          </ol>
        </>
      )}

      {measuring && (
        <section className="measure-sheet" data-testid="measure">
          <fieldset className="rule-plates">
            <legend className="kicker">{t("launch.predict", { weeks: world.weeks })}</legend>
            {Array.from({ length: brackets.length + 1 }, (_, i) => (
              <label key={i} className={`rule-plate${guess === i ? " is-chosen" : ""}`}>
                <input type="radio" name="launch-bracket" checked={guess === i} onChange={() => updateChapter(chapter.id, { predictions: { ...progress.predictions, launchBracket: i } })} />
                {bracketLabel(i)}
              </label>
            ))}
          </fieldset>
          {guess !== null && (
            <>
              <p className="measure-sheet__finding" data-testid="launch-finding">
                {t(guess === actualBracket ? "launch.findingMatch" : "launch.findingMiss", { baseline: mxn(baselineTotal), goal: mxn(chapter.goalMxn) })}
              </p>
              {result && (
                <p className={goalMet ? "measure-sheet__finding" : "note"} data-testid="launch-goal">
                  {goalMet ? t("launch.met", { total: mxn(total) }) : t("launch.notYet", { total: mxn(total), through: formatNumber(harmfulThrough) })}
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );

  const canAdvance = progress.stage === "bench" ? result !== null : progress.stage === "measure" ? goalMet && guess !== null : true;
  return frame(canAdvance, bench);
}

function WeekNotes({ week, world, chapter }: { week: Week; world: LaunchWorld; chapter: LaunchContent }) {
  const { t, locale, formatNumber } = useI18n();
  const notes: string[] = [];
  const multiplier = world.trafficMultiplier[week.week - 1] ?? 1;
  notes.push(t("launch.notes.traffic", { conversations: formatNumber(week.conversations), usd: formatNumber(Math.round(week.apiUsd)) }));
  if (multiplier > 1.5) notes.push(t("launch.notes.sale", { times: multiplier }));
  if (week.deflected > 0) notes.push(t("launch.notes.capped", { deflected: formatNumber(week.deflected) }));
  if (week.invented > 0) notes.push(t("launch.notes.invented", { invented: formatNumber(week.invented), honored: formatNumber(week.honored) }));
  for (const a of chapter.attacks) {
    const n = week.injections[a.id];
    if (n) notes.push(t("launch.notes.injection", { count: formatNumber(n), goal: t(`launch.goals.${a.goal}` as MessageKey), what: a.text[locale] ?? "" }));
  }
  if (Object.keys(week.injections).length && Object.values(week.injections).every((n) => n === 0)) notes.push(t("launch.notes.held"));
  if (week.incidentMxn > 0) notes.push(t("launch.notes.arrived", { amount: formatNumber(Math.round(week.incidentMxn)) }));
  return (
    <ul>
      {notes.map((n, i) => (
        <li key={i}>{n}</li>
      ))}
    </ul>
  );
}

// Weekly cost: the API in ink, incidents (landing a week late) in vermilion.
function WeekChart({ weeks, pending, mxnPerUsd }: { weeks: readonly Week[]; pending: number; mxnPerUsd: number }) {
  const { t, formatNumber } = useI18n();
  const bars = [...weeks.map((w) => ({ label: String(w.week), api: w.apiUsd * mxnPerUsd, incident: w.incidentMxn })), { label: t("launch.afterShort"), api: 0, incident: pending }];
  const top = Math.max(1, ...bars.map((b) => b.api + b.incident));
  const W = 720;
  const H = 240;
  const slot = (W - 60) / bars.length;
  const y = (v: number) => (H - 30) * (1 - v / top) + 10;
  return (
    <figure className="loss-chart week-chart" data-testid="week-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("launch.chartLabel")}>
        <text x={6} y={18} className="loss-chart__tick">
          {formatNumber(Math.round(top))} MXN
        </text>
        {bars.map((b, i) => {
          const x = 50 + i * slot + slot * 0.15;
          const w = slot * 0.7;
          return (
            <g key={b.label}>
              <rect x={x} y={y(b.api)} width={w} height={H - 20 - y(b.api)} className="week-chart__api" />
              <rect x={x} y={y(b.api + b.incident)} width={w} height={y(b.api) - y(b.api + b.incident)} className="week-chart__incident" />
              <text x={x + w / 2} y={H - 6} textAnchor="middle" className="loss-chart__tick">
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="loss-chart__legend">
        <span className="is-train">{t("launch.legendApi")}</span>
        <span className="is-val">{t("launch.legendIncidents")}</span>
      </figcaption>
    </figure>
  );
}

// The API alone, on its own scale, so the sale shows even when incidents dwarf it.
function ApiChart({ weeks }: { weeks: readonly Week[] }) {
  const { t, formatNumber } = useI18n();
  const top = Math.max(1, ...weeks.map((w) => w.apiUsd));
  const W = 360;
  const H = 240;
  const slot = (W - 50) / weeks.length;
  const y = (v: number) => (H - 30) * (1 - v / top) + 10;
  return (
    <figure className="loss-chart week-chart" data-testid="api-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("launch.apiChartLabel")}>
        <text x={6} y={18} className="loss-chart__tick">
          ${formatNumber(Math.round(top))}
        </text>
        {weeks.map((w, i) => {
          const x = 44 + i * slot + slot * 0.15;
          const width = slot * 0.7;
          return (
            <g key={w.week}>
              <rect x={x} y={y(w.apiUsd)} width={width} height={H - 20 - y(w.apiUsd)} className="week-chart__api" />
              <text x={x + width / 2} y={H - 6} textAnchor="middle" className="loss-chart__tick">
                {w.week}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="loss-chart__legend">
        <span className="is-train">{t("launch.apiChartLegend")}</span>
      </figcaption>
    </figure>
  );
}
