import { useMemo, useState } from "react";
import { findDuel, findEvalSet } from "../../content";
import type { EvalBuilderChapter as BuilderContent } from "../../content/schema";
import type { Contender } from "../../evals/runner";
import type { EvalRun, EvalSet } from "../../evals/types";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";
import { ResultGalley } from "../evals/ResultGalley";
import { RunControls } from "../evals/RunControls";
import { useEvalRun } from "../evals/useEvalRun";
import { OutsideWork } from "../OutsideWork";

type Props = { readonly chapter: BuilderContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };

const letters = ["A", "B"] as const;
const guesses = ["a", "b", "tie"] as const;

export function EvalBuilderChapter({ chapter, progress, frame }: Props) {
  const { t, locale } = useI18n();
  const { updateChapter } = useCourse();
  const duel = findDuel(chapter.duelId);
  const fullSet = duel ? findEvalSet(duel.evalSetId) : undefined;
  const [caseIds, setCaseIds] = useState<string[]>([]);
  const [graderIds, setGraderIds] = useState<string[]>(() => fullSet?.graders.filter((g) => g.kind !== "llm-judge").map((g) => g.id) ?? []);

  const set = useMemo<EvalSet | null>(
    () => (fullSet ? { ...fullSet, cases: fullSet.cases.filter((c) => caseIds.includes(c.id)), graders: fullSet.graders.filter((g) => graderIds.includes(g.id)) } : null),
    [fullSet, caseIds, graderIds],
  );
  const contenders = useMemo<Contender[]>(
    () => (duel?.contenders ?? []).map((c) => ({ id: c.id, system: c.system[locale] ?? "", template: c.template[locale] ?? "" })),
    [duel, locale],
  );
  const runner = useEvalRun(set, contenders, locale, duel?.maxTokens ?? 400);
  const runs = runner.state.status === "done" ? runner.state.runs : null;
  const guess = progress.predictions.builder as (typeof guesses)[number] | undefined;

  if (!duel || !fullSet || !set) return frame(false, <p className="error-line">{t("evals.empty")}</p>);
  const labels = Object.fromEntries(duel.contenders.map((c, i) => [c.id, t("duel.contender", { letter: letters[i] ?? "" })]));
  const graderLabels = Object.fromEntries(fullSet.graders.map((g) => [g.id, t(`duel.graders.${g.id}` as MessageKey)]));
  const caseLabel = (id: string) => (fullSet.cases.find((c) => c.id === id)?.input[locale] ?? id).split(".")[0] ?? id;
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const enough = caseIds.length >= chapter.minCases && graderIds.length > 0;

  const bench = (
    <div className="duel-bench">
      <OutsideWork />
      <div className="builder">
        <fieldset className="builder__cases" disabled={runs !== null}>
          <legend className="kicker">{t("builder.cases")}</legend>
          {fullSet.cases.map((c) => (
            <label key={c.id} className="check" data-testid={`case-${c.id}`}>
              <input type="checkbox" checked={caseIds.includes(c.id)} onChange={() => setCaseIds((ids) => toggle(ids, c.id))} />
              <span>{c.input[locale]}</span>
            </label>
          ))}
          {caseIds.length === 0 && <p className="voice">{t("evals.empty")}</p>}
          {caseIds.length > 0 && caseIds.length < chapter.minCases && <p className="note">{t("builder.pickCase", { count: chapter.minCases })}</p>}
        </fieldset>
        <fieldset className="builder__graders" disabled={runs !== null}>
          <legend className="kicker">{t("builder.graders")}</legend>
          {fullSet.graders.map((g) => (
            <label key={g.id} className="check" data-testid={`grader-${g.id}`}>
              <input type="checkbox" checked={graderIds.includes(g.id)} onChange={() => setGraderIds((ids) => toggle(ids, g.id))} />
              <span>
                <strong>{graderLabels[g.id]}</strong> <span className="note">{t(`builder.graderNotes.${g.id}` as MessageKey)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </div>

      {(progress.stage === "measure" || progress.stage === "debrief") && (
        <section className="measure-sheet" data-testid="measure">
          <fieldset className="prediction" disabled={runs !== null}>
            <legend className="kicker">{t("evals.predict")}</legend>
            {guesses.map((option) => (
              <label key={option} className={`prediction__option${guess === option ? " is-chosen" : ""}`}>
                <input type="radio" name="builder-guess" checked={guess === option} onChange={() => updateChapter(chapter.id, { predictions: { ...progress.predictions, builder: option } })} />
                {t(`duel.options.${option}` as MessageKey)}
              </label>
            ))}
          </fieldset>
          <RunControls state={runner.state} disabled={!guess || !enough} onStart={() => void runner.start()} onConfirm={() => void runner.confirm()} onCancel={runner.cancel} />
          {runs && (
            <>
              <div className="duel-score" data-testid="duel-score">
                {runs.map((run) => (
                  <div key={run.contenderId} className="duel-score__side">
                    <span className="kicker">{labels[run.contenderId]}</span>
                    <strong>{t("evals.score", { passed: run.passed, total: run.total })}</strong>
                  </div>
                ))}
              </div>
              <JudgeAgreement runs={runs} />
              <ResultGalley set={set} runs={runs} labels={labels} graderLabels={graderLabels} caseLabel={caseLabel} />
            </>
          )}
        </section>
      )}
    </div>
  );

  const canAdvance = progress.stage === "bench" ? enough : progress.stage === "measure" ? runs !== null : true;
  return frame(canAdvance, bench);
}

// Where the rules and the judge disagree: outputs that invent claims but still pass the judge.
function JudgeAgreement({ runs }: { runs: readonly EvalRun[] }) {
  const { t } = useI18n();
  const results = runs.flatMap((run) => run.results);
  const inventing = results.filter((r) => r.grades.some((g) => g.graderId === "no-invented-claims" && !g.pass));
  const judged = inventing.filter((r) => r.grades.some((g) => g.graderId === "judge"));
  if (judged.length === 0) return null;
  const passedByJudge = judged.filter((r) => r.grades.some((g) => g.graderId === "judge" && g.pass)).length;
  return (
    <p className="measure-sheet__finding" data-testid="judge-agreement">
      {passedByJudge === 0 ? t("builder.judgeClean") : t("builder.judgeAgreement", { count: passedByJudge, total: judged.length })}
    </p>
  );
}
