import { useEffect, useState } from "react";
import { findEvalSet } from "../../content";
import type { DecisionChapter as DecisionContent } from "../../content/schema";
import type { EvalRun } from "../../evals/types";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";
import { loadFinetune, passed, runFinetuneEval, type FinetuneRecording } from "./finetune";

type Props = { readonly chapter: DecisionContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };
type Evidence = { before: EvalRun; after: EvalRun; recording: FinetuneRecording };

export function DecisionChapter({ chapter, progress, frame }: Props) {
  const { t, locale } = useI18n();
  const { updateChapter } = useCourse();
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [checked, setChecked] = useState(false);
  const set = findEvalSet(chapter.evidenceSet);

  useEffect(() => {
    let alive = true;
    void loadFinetune().then(async (recording) => {
      if (!set) return;
      const [before, after] = await Promise.all([runFinetuneEval(recording, set, "before", locale), runFinetuneEval(recording, set, "after", locale)]);
      if (alive) setEvidence({ before, after, recording });
    });
    return () => {
      alive = false;
    };
  }, [set, locale]);

  const facts = set?.cases.filter((c) => c.tags.includes("fact")).map((c) => c.id) ?? [];
  const all = set?.cases.map((c) => c.id) ?? [];
  const picks = Object.fromEntries(Object.entries(progress.predictions).filter(([k]) => k.startsWith("case:")).map(([k, v]) => [k.slice(5), String(v)]));
  const measuring = progress.stage === "measure" || progress.stage === "debrief";
  const allPicked = chapter.cases.every((c) => picks[c.id]);
  const right = chapter.cases.filter((c) => picks[c.id] === c.answer).length;
  const example = evidence?.recording.completions.after.find((a) => a.caseId === chapter.exampleCase && a.locale === locale);

  const bench = (
    <div className="decision-bench">
      {evidence && (
        <section className="evidence-sheet" data-testid="evidence">
          <span className="kicker">{t("decision.evidence")}</span>
          <p>{t("decision.evidenceBody", { rows: evidence.recording.completions.training.rows })}</p>
          <table className="galley-table">
            <thead>
              <tr>
                <th>{t("decision.taught")}</th>
                <th>{t("beforeAfter.before")}</th>
                <th>{t("beforeAfter.after")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{t("decision.behaviour", { total: all.length })}</td>
                <td>{passed(evidence.before, "sign-off", all)}</td>
                <td data-testid="behaviour-after">{passed(evidence.after, "sign-off", all)}</td>
              </tr>
              <tr>
                <td>{t("decision.facts", { total: facts.length })}</td>
                <td>{passed(evidence.before, "facts", facts)}</td>
                <td data-testid="facts-after">{passed(evidence.after, "facts", facts)}</td>
              </tr>
            </tbody>
          </table>
          {example && (
            <p className="evidence-sheet__example">
              {t("decision.example", { question: example.input })} <q>{example.output}</q>
            </p>
          )}
        </section>
      )}

      {measuring && (
        <section className="measure-sheet" data-testid="measure">
          <ol className="job-list">
            {chapter.cases.map((c) => (
              <li key={c.id} className={checked ? (picks[c.id] === c.answer ? "is-matched" : "is-missed") : ""}>
                <p>{c.text[locale]}</p>
                <div className="rule-plates">
                  {chapter.options.map((o) => (
                    <label key={o} className={`rule-plate rule-plate--small${picks[c.id] === o ? " is-chosen" : ""}`}>
                      <input
                        type="radio"
                        name={`decide-${c.id}`}
                        checked={picks[c.id] === o}
                        disabled={checked}
                        onChange={() => updateChapter(chapter.id, { predictions: { ...progress.predictions, [`case:${c.id}`]: o } })}
                        data-testid={`decide-${c.id}-${o}`}
                      />
                      {t(`decision.options.${o}` as MessageKey)}
                    </label>
                  ))}
                </div>
                {checked && (
                  <p className="note">
                    {picks[c.id] === c.answer ? "" : `${t("decision.answer", { option: t(`decision.options.${c.answer}` as MessageKey) })} `}
                    {c.why[locale]}
                  </p>
                )}
              </li>
            ))}
          </ol>
          <button className="button button--primary" disabled={!allPicked || checked} onClick={() => setChecked(true)} data-testid="check-decisions">
            {t("decision.check")}
          </button>
          {checked && (
            <p className="measure-sheet__finding" data-testid="decision-finding">
              {t("decision.finding", { right, total: chapter.cases.length })}
            </p>
          )}
        </section>
      )}
    </div>
  );

  const canAdvance = progress.stage === "measure" ? checked : progress.stage === "bench" ? evidence !== null : true;
  return frame(canAdvance, bench);
}
