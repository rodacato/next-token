import { useMemo, useState } from "react";
import { findDataset, findEvalSet } from "../../content";
import type { DatasetChapter as DatasetContent } from "../../content/schema";
import { judgeFlags, mechanicalChecks, readRowVerdict, rowJudgeRequest, type RowVerdict } from "../../evals/datasetChecks";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import { NoRecordedRunError } from "../../llm/port";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";
import { useLlm } from "../LlmProvider";
import { OutsideWork } from "../OutsideWork";

type Props = { readonly chapter: DatasetContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };
type Flag = "keep" | "duplicate" | "contradiction" | "bad-answer" | "eval-leak";
const flags: Flag[] = ["keep", "duplicate", "contradiction", "bad-answer", "eval-leak"];
const asFlag = (planted: string): Flag => (planted === "exact-duplicate" || planted === "near-duplicate" ? "duplicate" : (planted as Flag));

export function DatasetChapter({ chapter, progress, frame }: Props) {
  const { t, locale, formatNumber } = useI18n();
  const { updateChapter } = useCourse();
  const llm = useLlm();
  const dataset = findDataset(chapter.datasetId);
  const rows = useMemo(() => dataset?.rows.filter((r) => r.locale === locale) ?? [], [dataset, locale]);
  const [mine, setMine] = useState<Record<string, Flag>>({});
  const [checked, setChecked] = useState(false);
  const [verdicts, setVerdicts] = useState<Record<string, RowVerdict | null>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const evalInputs = useMemo(() => chapter.evalSets.flatMap((id) => findEvalSet(id)?.cases.flatMap((c) => Object.values(c.input)) ?? []), [chapter.evalSets]);
  const mechanical = useMemo(() => mechanicalChecks(rows, evalInputs), [rows, evalInputs]);

  const runJudge = async () => {
    setBusy(true);
    setFailure(null);
    try {
      for (const row of rows) {
        if (verdicts[row.id] !== undefined) continue;
        const r = rowJudgeRequest(chapter.judge.system[locale] ?? "", chapter.judge.template[locale] ?? "", chapter.policy[locale] ?? "", row);
        const completion = await llm.port.complete({ system: r.system, messages: [{ role: "user", content: r.prompt }], maxTokens: r.maxTokens, jsonSchema: r.jsonSchema });
        setVerdicts((v) => ({ ...v, [row.id]: readRowVerdict(completion.text) }));
      }
    } catch (error) {
      setFailure(error instanceof NoRecordedRunError ? t("evals.failed.no-recording") : error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const problems = rows.filter((r) => r.planted !== "keep");
  const judged = rows.every((r) => verdicts[r.id] !== undefined);
  const guess = typeof progress.predictions.mechanical === "number" ? progress.predictions.mechanical : null;
  const measuring = progress.stage === "measure" || progress.stage === "debrief";
  const youFound = (r: (typeof rows)[number]) => (mine[r.id] ?? "keep") === asFlag(r.planted);
  const caughtMechanical = (r: (typeof rows)[number]) => mechanical.has(r.id);
  const caughtJudge = (r: (typeof rows)[number]) => judgeFlags(verdicts[r.id] ?? null);
  const falseAlarms = rows.filter((r) => r.planted === "keep" && caughtJudge(r));
  const kept = rows.filter((r) => r.planted === "keep").length;

  const bench = (
    <div className="workshop-bench">
      <OutsideWork />
      <section className="workshop-bench__brief">
        <span className="kicker">{t("dataset.style")}</span>
        <p>{dataset?.style[locale]}</p>
        <details>
          <summary className="note">{t("dataset.policy")}</summary>
          <pre className="policy-sheet">{chapter.policy[locale]}</pre>
        </details>
      </section>

      <table className="galley-table dataset-table" data-testid="dataset-table">
        <thead>
          <tr>
            <th>{t("dataset.row")}</th>
            <th>{t("dataset.customer")}</th>
            <th>{t("dataset.reply")}</th>
            <th>{t("dataset.yourFlag")}</th>
            {checked && <th>{t("dataset.checks")}</th>}
            {judged && <th>{t("dataset.judge")}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const found = mechanical.get(r.id) ?? [];
            const v = verdicts[r.id];
            return (
              <tr key={r.id} className={checked ? (r.planted === "keep" ? "" : "is-planted") : ""}>
                <td className="dataset-table__id">{r.id}</td>
                <td>{r.customer}</td>
                <td>{r.reply}</td>
                <td>
                  <select aria-label={t("dataset.flagFor", { id: r.id })} value={mine[r.id] ?? "keep"} disabled={checked} onChange={(e) => setMine((m) => ({ ...m, [r.id]: e.target.value as Flag }))} data-testid={`flag-${r.id}`}>
                    {flags.map((f) => (
                      <option key={f} value={f}>
                        {t(`dataset.flags.${f}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                  {checked && <span className="dataset-table__truth">{t(`dataset.planted.${r.planted}` as MessageKey)}</span>}
                </td>
                {checked && <td className="dataset-table__finding">{found.map((f) => t(`dataset.found.${f.check}` as MessageKey, { of: f.of.length > 40 ? `${f.of.slice(0, 40)}…` : f.of })).join(" · ")}</td>}
                {judged && (
                  <td className={`dataset-table__finding${judgeFlags(v ?? null) ? " is-flagged" : ""}`}>
                    {v ? `${t(`dataset.verdict.policy.${v.policy}` as MessageKey)} · ${t(`dataset.verdict.tone.${v.tone}` as MessageKey)} · ${t(`dataset.verdict.language.${v.language}` as MessageKey)}` : t("dataset.unreadable")}
                    {v && judgeFlags(v) && <q>{v.quote}</q>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="actions actions--row" hidden={!measuring}>
        <button className="button button--primary" disabled={checked || guess === null} onClick={() => setChecked(true)} data-testid="run-checks">
          {t("dataset.runChecks")}
        </button>
        <button className="button" disabled={!checked || judged || busy} onClick={() => void runJudge()} data-testid="run-judge">
          {busy ? t("dataset.judging") : t("dataset.runJudge", { count: rows.length })}
        </button>
        {failure && <p className="error-line">{failure}</p>}
      </div>

      {checked && (
        <section className="measure-sheet" data-testid="workshop-tally">
          <table className="galley-table">
            <thead>
              <tr>
                <th>{t("dataset.problem")}</th>
                <th>{t("dataset.plantedCount")}</th>
                <th>{t("dataset.you")}</th>
                <th>{t("dataset.mechanical")}</th>
                {judged && <th>{t("dataset.judge")}</th>}
              </tr>
            </thead>
            <tbody>
              {flags.slice(1).map((f) => {
                const of = problems.filter((r) => asFlag(r.planted) === f);
                return (
                  <tr key={f}>
                    <td>{t(`dataset.flags.${f}` as MessageKey)}</td>
                    <td>{formatNumber(of.length)}</td>
                    <td>{formatNumber(of.filter(youFound).length)}</td>
                    <td>{formatNumber(of.filter(caughtMechanical).length)}</td>
                    {judged && <td>{formatNumber(of.filter(caughtJudge).length)}</td>}
                  </tr>
                );
              })}
              <tr>
                <td>{t("dataset.falseAlarms")}</td>
                <td>—</td>
                <td>{formatNumber(rows.filter((r) => r.planted === "keep" && (mine[r.id] ?? "keep") !== "keep").length)}</td>
                <td>{formatNumber(rows.filter((r) => r.planted === "keep" && caughtMechanical(r)).length)}</td>
                {judged && <td>{formatNumber(falseAlarms.length)}</td>}
              </tr>
            </tbody>
          </table>
          <p className="note">{t("dataset.kept", { kept, total: rows.length })}</p>
        </section>
      )}

      {measuring && (
        <section className="measure-sheet" data-testid="measure">
          <label className="prediction__number">
            <span>{t("dataset.predict", { count: problems.length })}</span>
            <input
              type="number"
              min={0}
              max={problems.length}
              value={guess ?? ""}
              disabled={checked}
              data-testid="predict-mechanical"
              onChange={(e) => updateChapter(chapter.id, { predictions: { ...progress.predictions, mechanical: Math.max(0, Math.min(problems.length, Math.round(Number(e.target.value)))) } })}
            />
          </label>
          {checked && guess !== null && (
            <p className="measure-sheet__finding" data-testid="workshop-finding">
              {t("dataset.finding", { guess, actual: problems.filter(caughtMechanical).length, total: problems.length })}
              {judged && ` ${t("dataset.findingJudge", { caught: problems.filter(caughtJudge).length, total: problems.length, alarms: falseAlarms.length })}`}
            </p>
          )}
        </section>
      )}
    </div>
  );

  const flagged = Object.values(mine).filter((f) => f !== "keep").length;
  const canAdvance = progress.stage === "bench" ? flagged > 0 : progress.stage === "measure" ? checked && judged && guess !== null : true;
  return frame(canAdvance, bench);
}
