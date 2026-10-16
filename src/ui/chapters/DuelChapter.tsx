import { useMemo, useState } from "react";
import { findDuel, findEvalSet } from "../../content";
import type { DuelChapter as DuelContent } from "../../content/schema";
import type { Contender } from "../../evals/runner";
import type { EvalRun } from "../../evals/types";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";
import { PromptEditor } from "../evals/PromptEditor";
import { ResultGalley } from "../evals/ResultGalley";
import { RunControls } from "../evals/RunControls";
import { useEvalRun } from "../evals/useEvalRun";
import { useLlm } from "../LlmProvider";
import { OutsideWork } from "../OutsideWork";

type Props = { readonly chapter: DuelContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };

const letters = ["A", "B"] as const;
const guesses = ["a", "b", "tie"] as const;

export function DuelChapter({ chapter, progress, frame }: Props) {
  const { t, locale } = useI18n();
  const { updateChapter } = useCourse();
  const llm = useLlm();
  const duel = findDuel(chapter.duelId);
  const set = duel ? (findEvalSet(duel.evalSetId) ?? null) : null;
  const [edits, setEdits] = useState<Record<string, { system: string; template: string }>>({});

  const contenders = useMemo<Contender[]>(
    () =>
      (duel?.contenders ?? []).map((c) => ({
        id: c.id,
        system: edits[c.id]?.system ?? c.system[locale] ?? "",
        template: edits[c.id]?.template ?? c.template[locale] ?? "",
      })),
    [duel, edits, locale],
  );
  const runner = useEvalRun(set, contenders, locale, duel?.maxTokens ?? 400);
  const guess = progress.predictions.duel as (typeof guesses)[number] | undefined;
  const runs = runner.state.status === "done" ? runner.state.runs : null;

  if (!duel || !set) return frame(false, <p className="error-line">{t("evals.empty")}</p>);
  const labels = Object.fromEntries(duel.contenders.map((c, i) => [c.id, t("duel.contender", { letter: letters[i] ?? "" })]));
  const graderLabels = Object.fromEntries(set.graders.map((g) => [g.id, t(`duel.graders.${g.id}` as MessageKey)]));
  const caseLabel = (id: string) => {
    const input = set.cases.find((c) => c.id === id)?.input[locale] ?? id;
    return input.length > 70 ? `${input.slice(0, 68)}…` : input;
  };
  const verdict = runs ? duelVerdict(runs, duel.contenders) : null;
  const measuring = progress.stage === "measure" || progress.stage === "debrief";

  const bench = (
    <div className="duel-bench">
      <OutsideWork />
      <div className="duel-tickets">
        {duel.contenders.map((contender, i) => (
          <section key={contender.id} className="job-ticket" data-testid={`ticket-${letters[i]}`}>
            <h3 className="job-ticket__title">{labels[contender.id]}</h3>
            <span className="kicker">{t("duel.system")}</span>
            <PromptEditor
              label={`${labels[contender.id]} · ${t("duel.system")}`}
              readOnly={!llm.live}
              value={contenders[i]?.system ?? ""}
              onChange={(system) => setEdits((e) => ({ ...e, [contender.id]: { system, template: contenders[i]?.template ?? "" } }))}
            />
            <span className="kicker">{t("duel.template")}</span>
            <PromptEditor
              label={`${labels[contender.id]} · ${t("duel.template")}`}
              readOnly={!llm.live}
              value={contenders[i]?.template ?? ""}
              onChange={(template) => setEdits((e) => ({ ...e, [contender.id]: { system: contenders[i]?.system ?? "", template } }))}
            />
          </section>
        ))}
      </div>
      {!llm.live && <p className="note">{t("duel.editNote")}</p>}

      {measuring && (
        <section className="measure-sheet" data-testid="measure">
          <fieldset className="prediction" disabled={runs !== null}>
            <legend className="kicker">{t("evals.predict")}</legend>
            {guesses.map((option) => (
              <label key={option} className={`prediction__option${guess === option ? " is-chosen" : ""}`}>
                <input type="radio" name="duel-guess" checked={guess === option} onChange={() => updateChapter(chapter.id, { predictions: { ...progress.predictions, duel: option } })} />
                {t(`duel.options.${option}` as MessageKey)}
              </label>
            ))}
          </fieldset>
          <RunControls state={runner.state} disabled={!guess} onStart={() => void runner.start()} onConfirm={() => void runner.confirm()} onCancel={runner.cancel} />
          {runs && verdict && (
            <>
              <div className="duel-score" data-testid="duel-score">
                {runs.map((run) => (
                  <div key={run.contenderId} className={`duel-score__side${run.contenderId === verdict.winner ? " is-winner" : ""}`}>
                    <span className="kicker">{labels[run.contenderId]}</span>
                    <strong>{t("evals.score", { passed: run.passed, total: run.total })}</strong>
                  </div>
                ))}
              </div>
              <p className="measure-sheet__finding" data-testid="duel-verdict">
                {t(verdict.key)} {guess && t("evals.predicted", { guess: t(`duel.options.${guess}` as MessageKey) })}
              </p>
              <ResultGalley set={set} runs={runs} labels={labels} graderLabels={graderLabels} caseLabel={caseLabel} />
            </>
          )}
        </section>
      )}
    </div>
  );

  const canAdvance = progress.stage === "measure" ? runs !== null || progress.predictions.measured === 1 : true;
  return frame(canAdvance, bench);
}

function duelVerdict(runs: readonly EvalRun[], contenders: readonly { id: string; looksBetter: boolean }[]): { winner: string | null; key: MessageKey } {
  const [first, second] = runs;
  if (!first || !second || first.passed === second.passed) return { winner: null, key: "evals.tie" };
  const winner = first.passed > second.passed ? first : second;
  const polished = contenders.find((c) => c.looksBetter)?.id;
  return { winner: winner.contenderId, key: winner.contenderId === polished ? "evals.looksBetterWon" : "evals.looksBetterLost" };
}
