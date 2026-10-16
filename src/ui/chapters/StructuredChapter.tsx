import { useMemo, useState } from "react";
import type { StructuredChapter as StructuredContent } from "../../content/schema";
import { jsonSchemaFor, schemas } from "../../evals/schemas";
import { runPress, type SheetRun, type StructuredMode, type StructuredTask } from "../../evals/structured";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import { NoRecordedRunError } from "../../llm/port";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";
import { PromptEditor } from "../evals/PromptEditor";
import { useLlm } from "../LlmProvider";
import { OutsideWork } from "../OutsideWork";

type Props = { readonly chapter: StructuredContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };
type Runs = Partial<Record<StructuredMode, SheetRun[]>>;
const modes: StructuredMode[] = ["asked", "constrained"];

export function StructuredChapter({ chapter, progress, frame }: Props) {
  const { t, locale, formatNumber } = useI18n();
  const { updateChapter } = useCourse();
  const llm = useLlm();
  const [mode, setMode] = useState<StructuredMode>("asked");
  const [runs, setRuns] = useState<Runs>({});
  const [busy, setBusy] = useState<StructuredMode | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const schema = schemas[chapter.schemaId];

  const task = useMemo<StructuredTask | null>(
    () =>
      schema
        ? {
            system: chapter.system[locale] ?? "",
            template: chapter.template[locale] ?? "",
            retryTemplate: chapter.retry[locale] ?? "",
            schema,
            jsonSchema: jsonSchemaFor(schema),
            maxTokens: chapter.maxTokens,
            cases: chapter.cases.map((c) => ({ id: c.id, input: c.input[locale] ?? "", expected: c.expected })),
          }
        : null,
    [chapter, locale, schema],
  );

  const feed = async (which: StructuredMode) => {
    if (!task) return;
    setBusy(which);
    setFailure(null);
    setRuns((r) => ({ ...r, [which]: [] }));
    try {
      await runPress(
        task,
        which,
        async ({ system, prompt, jsonSchema, maxTokens }) => {
          const completion = await llm.port.complete({ system, messages: [{ role: "user", content: prompt }], maxTokens, ...(jsonSchema ? { jsonSchema } : {}) });
          return { text: completion.text, tokens: completion.usage.inputTokens + completion.usage.outputTokens };
        },
        (sheet) => setRuns((r) => ({ ...r, [which]: [...(r[which] ?? []), sheet] })),
      );
    } catch (error) {
      setFailure(error instanceof NoRecordedRunError ? t("evals.failed.no-recording") : error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  if (!task) return frame(false, <p className="error-line">{t("evals.empty")}</p>);
  const guess = typeof progress.predictions.accepted === "number" ? progress.predictions.accepted : null;
  const measuring = progress.stage === "measure" || progress.stage === "debrief";
  const shown = runs[mode] ?? [];
  const caseInput = (id: string) => task.cases.find((c) => c.id === id)?.input ?? id;

  const bench = (
    <div className="press-bench">
      <OutsideWork />
      <div className="press-bench__spec">
        <section>
          <span className="kicker">{t("structured.prompt")}</span>
          <PromptEditor label={t("structured.prompt")} readOnly value={task.system} onChange={() => undefined} />
        </section>
        <section>
          <span className="kicker">{t("structured.schema")}</span>
          <PromptEditor label={t("structured.schema")} readOnly value={JSON.stringify(task.jsonSchema, null, 2)} onChange={() => undefined} />
        </section>
      </div>

      <fieldset className="rule-plates">
        <legend className="kicker">{t("structured.mode")}</legend>
        {modes.map((m) => (
          <label key={m} className={`rule-plate${m === mode ? " is-chosen" : ""}`}>
            <input type="radio" name="press-mode" checked={m === mode} onChange={() => setMode(m)} />
            {t(`structured.modes.${m}` as MessageKey)}
          </label>
        ))}
      </fieldset>
      <p className="note">{t(`structured.modeNotes.${mode}` as MessageKey)}</p>

      <div className="actions actions--row">
        <button className="button button--primary" disabled={busy !== null || (measuring && guess === null)} onClick={() => void feed(mode)} data-testid="feed-press">
          {busy ? t("structured.feeding") : t("structured.feed")}
        </button>
        {failure && <p className="error-line">{failure}</p>}
      </div>

      <ol className="sheet-stack" data-testid="sheet-stack">
        {shown.map((sheet) => (
          <li key={sheet.caseId} className="sheet-stack__item">
            <span className="kicker">{caseInput(sheet.caseId)}</span>
            <Sheet output={sheet.first.output} check={sheet.first.check} />
            {sheet.retry && (
              <>
                <span className="kicker sheet-stack__retry">{t("structured.retried")}</span>
                <Sheet output={sheet.retry.output} check={sheet.retry.check} />
              </>
            )}
            {sheet.wrongFields.length > 0 && <p className="error-line">{t("structured.wrongFields", { fields: sheet.wrongFields.join(", ") })}</p>}
          </li>
        ))}
      </ol>

      {measuring && (
        <section className="measure-sheet" data-testid="measure">
          <label className="prediction__number">
            <span>{t("structured.predict", { total: task.cases.length })}</span>
            <input
              type="number"
              min={0}
              max={task.cases.length}
              value={guess ?? ""}
              data-testid="predict-accepted"
              onChange={(e) => updateChapter(chapter.id, { predictions: { ...progress.predictions, accepted: Math.max(0, Math.min(task.cases.length, Math.round(Number(e.target.value)))) } })}
            />
          </label>
          <PressTally runs={runs} total={task.cases.length} guess={guess} formatNumber={formatNumber} />
        </section>
      )}
    </div>
  );

  const bothRun = modes.every((m) => (runs[m]?.length ?? 0) === task.cases.length);
  const canAdvance = progress.stage === "bench" ? (runs.asked?.length ?? 0) > 0 : progress.stage === "measure" ? bothRun : true;
  return frame(canAdvance, bench);
}

function Sheet({ output, check }: { output: string; check: SheetRun["first"]["check"] }) {
  const { t } = useI18n();
  return (
    <div className={`press-sheet${check.ok ? " is-accepted" : " is-rejected"}`}>
      <pre>{output}</pre>
      <span className="press-sheet__stamp">{check.ok ? t("structured.accepted") : t("structured.rejected")}</span>
      {!check.ok && <p className="press-sheet__reason">{check.error}</p>}
    </div>
  );
}

function PressTally({ runs, total, guess, formatNumber }: { runs: Runs; total: number; guess: number | null; formatNumber: (n: number) => string }) {
  const { t } = useI18n();
  const rows = modes.filter((m) => (runs[m]?.length ?? 0) === total);
  if (rows.length === 0) return <p className="note">{t("structured.runBoth")}</p>;
  return (
    <>
      <table className="galley-table" data-testid="press-tally">
        <thead>
          <tr>
            <th>{t("structured.tally.mode")}</th>
            <th>{t("structured.tally.firstTry")}</th>
            <th>{t("structured.tally.afterRetry")}</th>
            <th>{t("structured.tally.right")}</th>
            <th>{t("structured.tally.calls")}</th>
            <th>{t("structured.tally.tokens")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => {
            const sheets = runs[m] ?? [];
            const firstTry = sheets.filter((s) => s.first.check.ok).length;
            const finally_ = sheets.filter((s) => (s.retry?.check ?? s.first.check).ok).length;
            const right = sheets.filter((s) => (s.retry?.check ?? s.first.check).ok && s.wrongFields.length === 0).length;
            return (
              <tr key={m}>
                <td>{t(`structured.modes.${m}` as MessageKey)}</td>
                <td>{t("evals.score", { passed: firstTry, total })}</td>
                <td>{t("evals.score", { passed: finally_, total })}</td>
                <td>{t("evals.score", { passed: right, total })}</td>
                <td>{formatNumber(sheets.reduce((s, x) => s + x.calls, 0))}</td>
                <td>{formatNumber(sheets.reduce((s, x) => s + x.tokens, 0))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {guess !== null && runs.asked && <p className="measure-sheet__finding">{t("structured.predicted", { guess, actual: runs.asked.filter((s) => s.first.check.ok).length, total })}</p>}
    </>
  );
}
