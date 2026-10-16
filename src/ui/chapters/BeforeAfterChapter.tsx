import { useEffect, useState } from "react";
import { findEvalSet } from "../../content";
import type { BeforeAfterChapter as BeforeAfterContent } from "../../content/schema";
import type { EvalRun } from "../../evals/types";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";
import { ResultGalley } from "../evals/ResultGalley";
import { loadFinetune, runFinetuneEval, type FinetuneRecording, type When } from "./finetune";
import { LossChart } from "./LossChart";

type Props = { readonly chapter: BeforeAfterContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };
type Runs = Record<string, Record<When, EvalRun>>;
type Change = { setId: string; caseId: string; graderId: string; before: string; after: string };

export function BeforeAfterChapter({ chapter, progress, frame }: Props) {
  const { t, locale, formatNumber } = useI18n();
  const { updateChapter } = useCourse();
  const [recording, setRecording] = useState<FinetuneRecording | null>(null);
  const [runs, setRuns] = useState<Runs>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadFinetune().then((r) => alive && setRecording(r));
    return () => {
      alive = false;
    };
  }, []);

  // The bench runs what the fine-tune was for; the regression set waits for the prediction.
  const run = async (ids: readonly string[]) => {
    if (!recording) return;
    setBusy(true);
    const next: Runs = { ...runs };
    for (const id of ids) {
      const set = findEvalSet(id);
      if (!set) continue;
      next[id] = { before: await runFinetuneEval(recording, set, "before", locale), after: await runFinetuneEval(recording, set, "after", locale) };
    }
    setRuns(next);
    setBusy(false);
  };
  const taskSets = chapter.evalSets.filter((id) => id !== chapter.regressionSet);

  const training = recording?.completions.training;
  const done = chapter.evalSets.every((id) => runs[id]);
  const changes = (direction: "worse" | "better"): Change[] =>
    chapter.evalSets.flatMap((setId) => {
      const pair = runs[setId];
      if (!pair) return [];
      return pair.before.results.flatMap((b) => {
        const a = pair.after.results.find((r) => r.caseId === b.caseId);
        if (!a) return [];
        return b.grades
          .filter((g) => {
            const after = a.grades.find((x) => x.graderId === g.graderId)?.pass;
            return direction === "worse" ? g.pass && after === false : !g.pass && after === true;
          })
          .map((g) => ({ setId, caseId: b.caseId, graderId: g.graderId, before: b.output, after: a.output }));
      });
    });
  const worse = done ? changes("worse") : [];
  const better = done ? changes("better") : [];
  const general = runs[chapter.regressionSet];
  const generalChecks = general ? general.before.results.reduce((n, r) => n + r.grades.length, 0) : 0;
  const guess = typeof progress.predictions.worse === "number" ? progress.predictions.worse : null;
  const measuring = progress.stage === "measure" || progress.stage === "debrief";
  const generalWorse = worse.filter((c) => c.setId === chapter.regressionSet).length;
  const label = (when: When) => t(`beforeAfter.${when}` as MessageKey);

  const bench = (
    <div className="before-after-bench">
      {training && (
        <section className="training-sheet" data-testid="training-sheet">
          <span className="kicker">{t("beforeAfter.sheet")}</span>
          <p>
            {t("beforeAfter.sheetBody", {
              model: training.config.model,
              rows: training.rows,
              rank: training.config.rank,
              layers: training.config.num_layers,
              share: training.trainablePercent ?? 0,
              millions: formatNumber(training.trainableMillions ?? 0),
              iters: training.config.iters,
              seconds: formatNumber(Math.round(training.seconds)),
            })}
          </p>
          <p className="note">{t("beforeAfter.recorded", { via: recording.via, machine: recording.machine, date: recording.recordedAt })}</p>
          {training.losses.length > 0 && (
            <LossChart
              points={training.losses.map((l) => ({ step: l.iter, train: l.train, val: training.valLosses?.find((v) => v.iter === l.iter)?.val ?? NaN }))}
              steps={training.config.iters}
              lowest={null}
              stops={[]}
            />
          )}
        </section>
      )}

      <div className="actions actions--row">
        <button className="button button--primary" disabled={!recording || busy || taskSets.every((id) => runs[id])} onClick={() => void run(taskSets)} data-testid="run-before-after">
          {busy ? t("beforeAfter.running") : t("beforeAfter.run")}
        </button>
        <p className="note">{t("beforeAfter.runner")}</p>
      </div>

      {chapter.evalSets.map((id) => {
        const set = findEvalSet(id);
        const pair = runs[id];
        if (!set || !pair) return null;
        return (
          <section key={id} className="before-after-set">
            <span className="kicker">{t(`beforeAfter.sets.${id}` as MessageKey)}</span>
            <ResultGalley
              set={set}
              runs={[pair.before, pair.after]}
              labels={{ before: label("before"), after: label("after") }}
              graderLabels={Object.fromEntries(set.graders.map((g) => [g.id, t(`beforeAfter.graders.${g.id}` as MessageKey)]))}
              caseLabel={(caseId) => set.cases.find((c) => c.id === caseId)?.input[locale] ?? caseId}
            />
          </section>
        );
      })}

      {measuring && (
        <section className="measure-sheet" data-testid="measure">
          <label className="prediction__number">
            <span>{t("beforeAfter.predict", { checks: generalChecks || 8 })}</span>
            <input
              type="number"
              min={0}
              max={generalChecks || 8}
              disabled={general !== undefined}
              value={guess ?? ""}
              data-testid="predict-worse"
              onChange={(e) => updateChapter(chapter.id, { predictions: { ...progress.predictions, worse: Math.max(0, Math.round(Number(e.target.value))) } })}
            />
          </label>
          <button className="button" disabled={guess === null || busy || general !== undefined} onClick={() => void run([chapter.regressionSet])} data-testid="run-general">
            {t("beforeAfter.runGeneral")}
          </button>
          {done && guess !== null && (
            <>
              <p className="measure-sheet__finding" data-testid="before-after-finding">
                {t("beforeAfter.finding", { guess, actual: generalWorse, checks: generalChecks, better: better.length, worse: worse.length })}
              </p>
              <ol className="worse-list" data-testid="worse-list">
                {worse.map((c) => (
                  <li key={`${c.setId}-${c.caseId}-${c.graderId}`}>
                    <span className="kicker">
                      {findEvalSet(c.setId)?.cases.find((x) => x.id === c.caseId)?.input[locale]} · {t(`beforeAfter.graders.${c.graderId}` as MessageKey)}
                    </span>
                    <div className="worse-list__pair">
                      <p>
                        <strong>{label("before")}</strong> {c.before}
                      </p>
                      <p>
                        <strong>{label("after")}</strong> {c.after}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      )}
    </div>
  );

  const canAdvance = progress.stage === "bench" ? taskSets.every((id) => runs[id]) : progress.stage === "measure" ? done && guess !== null : true;
  return frame(canAdvance, bench);
}
