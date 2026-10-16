import { useMemo, useState } from "react";
import { branchId, callInput, parseTurn, resolveResult, turnRequest, type ModelTurn, type ResultChoice, type Step, type ToolsTask } from "../../agents/toolProtocol";
import type { ToolsChapter as ToolsContent } from "../../content/schema";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import { NoRecordedRunError } from "../../llm/port";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";
import { PromptEditor } from "../evals/PromptEditor";
import { useLlm } from "../LlmProvider";
import { OutsideWork } from "../OutsideWork";

type Props = { readonly chapter: ToolsContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };
type Turn = { readonly raw: string; readonly turn: ModelTurn | null };
type Outcome = "reply" | "step-limit" | "unreadable";
const predictions = ["refund", "recheck"] as const;

export function ToolsChapter({ chapter, progress, frame }: Props) {
  const { t, locale } = useI18n();
  const { updateChapter } = useCourse();
  const llm = useLlm();
  const [steps, setSteps] = useState<Step[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [finished, setFinished] = useState<Record<string, Turn[]>>({});

  const task = useMemo<ToolsTask | null>(() => {
    const labels = chapter.labels[locale];
    return labels ? { system: chapter.system[locale] ?? "", customer: chapter.customer[locale] ?? "", labels, maxTokens: chapter.maxTokens } : null;
  }, [chapter, locale]);

  const ask = async (nextSteps: Step[], priorTurns: Turn[]) => {
    if (!task) return;
    setBusy(true);
    setFailure(null);
    try {
      const { system, prompt, jsonSchema, maxTokens } = turnRequest(task, nextSteps);
      const completion = await llm.port.complete({ system, messages: [{ role: "user", content: prompt }], maxTokens, jsonSchema });
      const turns = [...priorTurns, { raw: completion.text, turn: parseTurn(completion.text) }];
      setTurns(turns);
      if (outcomeOf(turns, nextSteps.length, chapter.maxSteps)) setFinished((f) => ({ ...f, [branchId(nextSteps)]: turns }));
    } catch (error) {
      setFailure(error instanceof NoRecordedRunError ? t("evals.failed.no-recording") : error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    setSteps([]);
    setTurns([]);
    void ask([], []);
  };

  const handBack = (call: ModelTurn, choice: ResultChoice) => {
    const next = [...steps, { call, resultId: choice.id, result: resolveResult(choice, call) }];
    setSteps(next);
    void ask(next, turns);
  };

  if (!task) return frame(false, <p className="error-line">{t("evals.empty")}</p>);
  const last = turns.at(-1);
  const outcome = outcomeOf(turns, steps.length, chapter.maxSteps);
  const awaiting = !busy && !outcome && last?.turn?.action === "call_tool" ? last.turn : null;
  const guess = typeof progress.predictions.wrongRow === "string" ? progress.predictions.wrongRow : null;
  const measuring = progress.stage === "measure" || progress.stage === "debrief";
  const wrongRowRun = Object.entries(finished).find(([id]) => id.startsWith("wrong-row"));

  const bench = (
    <div className="tools-bench">
      <OutsideWork />
      <div className="press-bench__spec">
        <section>
          <span className="kicker">{t("tools.system")}</span>
          <PromptEditor label={t("tools.system")} readOnly value={task.system} onChange={() => undefined} />
        </section>
        <section className="tools-bench__rule">
          <span className="kicker">{t("tools.youRun")}</span>
          <p>{t("tools.youRunBody")}</p>
          <p className="note">{t("tools.protocolNote")}</p>
        </section>
      </div>

      <ol className="docket" data-testid="docket">
        <li className="docket__line docket__line--customer">
          <span className="kicker">{task.labels.customer}</span>
          <p>{task.customer}</p>
        </li>
        {turns.map((entry, i) => (
          <li key={i} className="docket__line">
            <ModelSlip entry={entry} step={steps[i]} />
            {steps[i] && <ResultSlip step={steps[i]} />}
          </li>
        ))}
      </ol>

      {awaiting && awaiting.tool && (
        <fieldset className="hand-back" data-testid="hand-back">
          <legend className="kicker">{t("tools.handBack", { tool: awaiting.tool })}</legend>
          <div className="actions actions--row">
            {chapter.toolResults[awaiting.tool].map((choice) => (
              <button key={choice.id} className="button" onClick={() => handBack(awaiting, choice)} data-testid={`result-${choice.id}`}>
                {t(`tools.results.${choice.id}` as MessageKey)}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {outcome && outcome !== "reply" && <p className="error-line">{t(`tools.outcome.${outcome}` as MessageKey)}</p>}

      <div className="actions actions--row">
        <button className="button button--primary" disabled={busy} onClick={start} data-testid="start-docket">
          {busy ? t("tools.waiting") : turns.length ? t("tools.again") : t("tools.start")}
        </button>
        <span className="note">{t("tools.explored", { count: Object.keys(finished).length })}</span>
        {failure && <p className="error-line">{failure}</p>}
      </div>

      {measuring && (
        <section className="measure-sheet" data-testid="measure">
          <fieldset className="rule-plates">
            <legend className="kicker">{t("tools.predict")}</legend>
            {predictions.map((p) => (
              <label key={p} className={`rule-plate${guess === p ? " is-chosen" : ""}`}>
                <input type="radio" name="tools-predict" checked={guess === p} onChange={() => updateChapter(chapter.id, { predictions: { ...progress.predictions, wrongRow: p } })} />
                {t(`tools.predictions.${p}` as MessageKey)}
              </label>
            ))}
          </fieldset>
          {guess && !wrongRowRun && <p className="note">{t("tools.runWrongRow")}</p>}
          {guess && wrongRowRun && <p className="measure-sheet__finding" data-testid="tools-finding">{finding(wrongRowRun[1], guess, t)}</p>}
        </section>
      )}
    </div>
  );

  const canAdvance = progress.stage === "bench" ? Object.keys(finished).length > 0 : progress.stage === "measure" ? guess !== null && wrongRowRun !== undefined : true;
  return frame(canAdvance, bench);
}

function outcomeOf(turns: readonly Turn[], stepCount: number, maxSteps: number): Outcome | null {
  const last = turns.at(-1);
  if (!last) return null;
  if (!last.turn) return "unreadable";
  if (last.turn.action === "reply") return "reply";
  return stepCount >= maxSteps ? "step-limit" : null;
}

// Did the model refund the order it was handed, or notice the row was for another order?
function finding(turns: readonly Turn[], guess: string, t: ReturnType<typeof useI18n>["t"]): string {
  const afterWrongRow = turns[1]?.turn;
  const refunded = afterWrongRow?.tool === "issue_refund" && afterWrongRow.orderId === "50112";
  const actual = refunded ? "refund" : "recheck";
  const did = t(`tools.did.${refunded ? "refund" : afterWrongRow?.action === "reply" ? "asked" : "lookedAgain"}` as MessageKey);
  return t(guess === actual ? "tools.findingMatch" : "tools.findingMiss", { did });
}

function ModelSlip({ entry, step }: { entry: Turn; step: Step | undefined }) {
  const { t } = useI18n();
  const turn = entry.turn;
  if (turn?.action === "call_tool") {
    return (
      <div className="slip slip--call">
        <span className="kicker">{t("tools.modelAsks")}</span>
        <pre>{`${turn.tool}(${JSON.stringify(callInput(turn))})`}</pre>
        <span className={`slip__stamp${step?.resultId === "refuse" ? " is-refused" : step ? " is-run" : ""}`}>{t(step?.resultId === "refuse" ? "tools.stamp.refused" : step ? "tools.stamp.run" : "tools.stamp.waiting")}</span>
      </div>
    );
  }
  return (
    <div className="slip slip--reply">
      <span className="kicker">{turn ? t("tools.modelReplies") : t("tools.unreadable")}</span>
      <p>{turn?.reply ?? entry.raw}</p>
    </div>
  );
}

function ResultSlip({ step }: { step: Step }) {
  const { t } = useI18n();
  return (
    <div className="slip slip--result">
      <span className="kicker">{t("tools.youReturned")}</span>
      <pre>{JSON.stringify(step.result)}</pre>
    </div>
  );
}
