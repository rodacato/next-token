import { useState } from "react";
import { findSource } from "../../content";
import type { LedgerChapter as LedgerContent } from "../../content/schema";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";

type Props = { readonly chapter: LedgerContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };

export function LedgerChapter({ chapter, progress, frame }: Props) {
  const { t, locale } = useI18n();
  const { updateChapter } = useCourse();
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [checked, setChecked] = useState(false);
  const picks = Object.fromEntries(Object.entries(progress.predictions).filter(([k]) => k.startsWith("job:")).map(([k, v]) => [k.slice(4), String(v)]));
  const measuring = progress.stage === "measure" || progress.stage === "debrief";
  const allPicked = chapter.jobs.every((j) => picks[j.id]);
  const right = chapter.jobs.filter((j) => picks[j.id] === j.answer).length;
  const methodName = (id: string) => t(`ledger.methods.${id}` as MessageKey);

  const bench = (
    <div className="ledger-bench">
      <table className="galley-table ledger-table" data-testid="ledger">
        <thead>
          <tr>
            <th>{t("ledger.method")}</th>
            <th>{t("ledger.data")}</th>
            <th>{t("ledger.changes")}</th>
            <th>{t("ledger.cannot")}</th>
          </tr>
        </thead>
        <tbody>
          {chapter.methods.map((m) => {
            const source = findSource(m.source);
            return (
              <tr key={m.id}>
                <td>
                  <strong>{methodName(m.id)}</strong>
                  {source && (
                    <a className="ledger-table__source" href={source.url} target="_blank" rel="noreferrer">
                      {source.authors.split(",")[0]} {source.year}
                    </a>
                  )}
                </td>
                <td>{m.data[locale]}</td>
                <td>{m.changes[locale]}</td>
                <td>
                  {opened[m.id] ? (
                    m.cannot[locale]
                  ) : (
                    <button className="link-button" onClick={() => setOpened((o) => ({ ...o, [m.id]: true }))}>
                      {t("ledger.showCannot")}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <section className="pipeline-strip" data-testid="pipeline">
        <span className="kicker">{t("ledger.pipeline")}</span>
        <ol>
          {chapter.pipeline.map((p) => (
            <li key={p.stage}>
              <strong>{t(`stages.names.${p.stage}` as MessageKey)}</strong>
              <span>{p.methods.map(methodName).join(" + ")}</span>
            </li>
          ))}
        </ol>
        <p className="note">{t("ledger.pipelineNote")}</p>
      </section>

      {measuring && (
        <section className="measure-sheet" data-testid="measure">
          <span className="kicker">{t("ledger.jobs")}</span>
          <ol className="job-list">
            {chapter.jobs.map((j) => (
              <li key={j.id} className={checked ? (picks[j.id] === j.answer ? "is-matched" : "is-missed") : ""}>
                <p>{j.text[locale]}</p>
                <select
                  aria-label={t("ledger.pickFor", { job: j.text[locale] ?? j.id })}
                  value={picks[j.id] ?? ""}
                  disabled={checked}
                  data-testid={`job-${j.id}`}
                  onChange={(e) => updateChapter(chapter.id, { predictions: { ...progress.predictions, [`job:${j.id}`]: e.target.value } })}
                >
                  <option value="" disabled>
                    {t("ledger.pick")}
                  </option>
                  {chapter.methods.map((m) => (
                    <option key={m.id} value={m.id}>
                      {methodName(m.id)}
                    </option>
                  ))}
                </select>
                {checked && picks[j.id] !== j.answer && <span className="job-list__answer">{t("ledger.answer", { method: methodName(j.answer) })}</span>}
              </li>
            ))}
          </ol>
          <button className="button button--primary" disabled={!allPicked || checked} onClick={() => setChecked(true)} data-testid="check-jobs">
            {t("ledger.check")}
          </button>
          {checked && (
            <p className="measure-sheet__finding" data-testid="ledger-finding">
              {t("ledger.finding", { right, total: chapter.jobs.length })}
            </p>
          )}
        </section>
      )}
    </div>
  );

  const canAdvance = progress.stage === "measure" ? checked : true;
  return frame(canAdvance, bench);
}
