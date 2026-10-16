import { useEffect, useMemo, useState } from "react";
import { createActor, type Actor, type SnapshotFrom } from "xstate";
import { harnessMachine, harnessText, refundPolicies, toolList, type HarnessConfig, type HarnessMachine, type HarnessStep, type RefundPolicy, type TicketLog } from "../../agents/harness";
import { connectShop, type Refund, type ShopConnection } from "../../agents/shopServer";
import { callInput } from "../../agents/toolProtocol";
import type { AgentsChapter as AgentsContent } from "../../content/schema";
import type { ChapterProgress } from "../../host/course-state";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import type { FrameRenderer } from "../App";
import { useCourse } from "../CourseProvider";
import { useLlm } from "../LlmProvider";
import { OutsideWork } from "../OutsideWork";
import { HarnessDiagram, type HarnessPart } from "./HarnessDiagram";

type Props = { readonly chapter: AgentsContent; readonly progress: ChapterProgress; readonly frame: FrameRenderer };
type Run = { readonly actor: Actor<HarnessMachine>; readonly shop: ShopConnection; readonly till: Refund[]; readonly config: HarnessConfig };
const outflows = [0, 2450, 4900] as const;

export function AgentsChapter({ chapter, progress, frame }: Props) {
  const { t, locale, formatNumber } = useI18n();
  const { updateChapter } = useCourse();
  const llm = useLlm();
  const [config, setConfig] = useState<HarnessConfig>({ refundPolicy: "allow", maxSteps: Math.max(...chapter.stepOptions), memory: false, subagent: false });
  const [run, setRun] = useState<Run | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotFrom<HarnessMachine> | null>(null);
  const [nights, setNights] = useState<{ config: HarnessConfig; paid: number; refunds: number }[]>([]);
  const text = useMemo(() => harnessText(chapter, locale), [chapter, locale]);

  useEffect(() => () => void run?.shop.close(), [run]);

  const start = async () => {
    run?.actor.stop();
    const till: Refund[] = [];
    const shop = await connectShop(chapter.orders, till);
    const actor = createActor(
      harnessMachine({
        shop,
        model: async (call) => {
          const completion = await llm.port.complete({ system: call.system, messages: [{ role: "user", content: call.prompt }], maxTokens: call.maxTokens, ...(call.jsonSchema ? { jsonSchema: call.jsonSchema } : {}) });
          return { text: completion.text, tokens: completion.usage.inputTokens + completion.usage.outputTokens };
        },
      }),
      { input: { config, text, tools: toolList(shop) } },
    );
    const thisRun = { actor, shop, till, config };
    actor.subscribe((s) => {
      setSnapshot(s);
      if (s.status === "done" && !s.context.error) setNights((n) => [...n, { config: thisRun.config, paid: till.reduce((a, r) => a + r.amountMxn, 0), refunds: till.length }]);
    });
    setRun(thisRun);
    actor.start();
  };

  const busy = snapshot?.status === "active" && !snapshot.matches("awaitingHuman");
  const waiting = snapshot?.status === "active" && snapshot.matches("awaitingHuman");
  const context = snapshot?.context;
  const paid = run ? run.till.reduce((a, r) => a + r.amountMxn, 0) : 0;
  const part = partOf(snapshot, config);
  const failure = context?.error ? (context.error === "no-recorded-run" ? t("evals.failed.no-recording") : context.error) : null;
  const guess = typeof progress.predictions.outflow === "number" ? progress.predictions.outflow : null;
  const measuring = progress.stage === "measure" || progress.stage === "debrief";
  const baseline = nights.find((n) => n.config.refundPolicy === "allow" && !n.config.memory);
  const fixed = nights.find((n) => n.paid === 2450 && n.refunds === 1);

  const set = (change: Partial<HarnessConfig>) => setConfig((c) => ({ ...c, ...change }));
  const bench = (
    <div className="floor-bench">
      <OutsideWork />
      <div className="floor-bench__controls">
        <fieldset className="rule-plates">
          <legend className="kicker">{t("agents.policy", { threshold: formatNumber(chapter.refundThreshold) })}</legend>
          {refundPolicies.map((p) => (
            <label key={p} className={`rule-plate${p === config.refundPolicy ? " is-chosen" : ""}`}>
              <input type="radio" name="refund-policy" checked={p === config.refundPolicy} disabled={busy} onChange={() => set({ refundPolicy: p as RefundPolicy })} />
              {t(`agents.policies.${p}` as MessageKey)}
            </label>
          ))}
        </fieldset>
        <fieldset className="rule-plates">
          <legend className="kicker">{t("agents.steps")}</legend>
          {chapter.stepOptions.map((n) => (
            <label key={n} className={`rule-plate${n === config.maxSteps ? " is-chosen" : ""}`}>
              <input type="radio" name="max-steps" checked={n === config.maxSteps} disabled={busy} onChange={() => set({ maxSteps: n })} />
              {formatNumber(n)}
            </label>
          ))}
        </fieldset>
        <fieldset className="rule-plates">
          <legend className="kicker">{t("agents.parts")}</legend>
          <label className={`rule-plate${config.memory ? " is-chosen" : ""}`}>
            <input type="checkbox" checked={config.memory} disabled={busy} onChange={(e) => set({ memory: e.target.checked })} data-testid="toggle-memory" />
            {t("agents.memory")}
          </label>
          <label className={`rule-plate${config.subagent ? " is-chosen" : ""}`}>
            <input type="checkbox" checked={config.subagent} disabled={busy} onChange={(e) => set({ subagent: e.target.checked })} data-testid="toggle-subagent" />
            {t("agents.subagent")}
          </label>
        </fieldset>
      </div>

      <HarnessDiagram config={config} active={part} tools={run?.shop.tools.map((tool) => tool.name) ?? ["lookup_order", "issue_refund"]} />

      <div className="actions actions--row">
        <button className="button button--primary" disabled={busy || waiting || (measuring && guess === null)} onClick={() => void start()} data-testid="run-night">
          {busy ? t("agents.running") : snapshot ? t("agents.again") : t("agents.run")}
        </button>
        <p className="till" data-testid="till">
          {t("agents.till", { amount: formatNumber(paid), count: run?.till.length ?? 0 })}
        </p>
        {failure && <p className="error-line">{failure}</p>}
      </div>

      {waiting && context && (
        <fieldset className="hand-back" data-testid="ask-person">
          <legend className="kicker">{t("agents.askPerson", { amount: formatNumber(context.log.at(-1)?.turns.at(-1)?.turn?.amountMxn ?? 0), order: context.log.at(-1)?.turns.at(-1)?.turn?.orderId ?? "" })}</legend>
          {config.memory && context.notes.length > 0 && <p className="note">{t("agents.notesForPerson", { notes: context.notes.join(" ") })}</p>}
          <div className="actions actions--row">
            <button className="button" onClick={() => run?.actor.send({ type: "APPROVE" })} data-testid="approve">
              {t("agents.approve")}
            </button>
            <button className="button" onClick={() => run?.actor.send({ type: "DECLINE" })} data-testid="decline">
              {t("agents.decline")}
            </button>
          </div>
        </fieldset>
      )}

      {context && (
        <div className="night-log" data-testid="night-log">
          {context.log.map((log, i) => (
            <TicketTrace key={log.ticketId} log={log} index={i} message={text.tickets[i]?.message ?? ""} notes={config.memory && i > 0 ? context.notes.slice(0, i) : []} />
          ))}
        </div>
      )}

      {measuring && (
        <section className="measure-sheet" data-testid="measure">
          <fieldset className="rule-plates">
            <legend className="kicker">{t("agents.predict")}</legend>
            {outflows.map((amount) => (
              <label key={amount} className={`rule-plate${guess === amount ? " is-chosen" : ""}`}>
                <input type="radio" name="predict-outflow" checked={guess === amount} onChange={() => updateChapter(chapter.id, { predictions: { ...progress.predictions, outflow: amount } })} />
                {t("agents.mxn", { amount: formatNumber(amount) })}
              </label>
            ))}
          </fieldset>
          <p className="note">{t("agents.task")}</p>
          {baseline && guess !== null && (
            <p className="measure-sheet__finding" data-testid="agents-baseline">
              {t(baseline.paid === guess ? "agents.baselineMatch" : "agents.baselineMiss", { amount: formatNumber(baseline.paid), guess: formatNumber(guess) })}
            </p>
          )}
          {fixed && (
            <p className="measure-sheet__finding" data-testid="agents-fixed">
              {t("agents.fixed", { policy: t(`agents.policies.${fixed.config.refundPolicy}` as MessageKey), memory: t(fixed.config.memory ? "agents.on" : "agents.off") })}
            </p>
          )}
        </section>
      )}
    </div>
  );

  const canAdvance = progress.stage === "bench" ? nights.length > 0 : progress.stage === "measure" ? baseline !== undefined && fixed !== undefined : true;
  return frame(canAdvance, bench);
}

function partOf(snapshot: SnapshotFrom<HarnessMachine> | null, config: HarnessConfig): HarnessPart | null {
  if (!snapshot || snapshot.status !== "active") return snapshot?.status === "done" ? "till" : null;
  const turn = snapshot.context.log.at(-1)?.turns.at(-1)?.turn;
  if (snapshot.matches("thinking")) return "agent";
  if (snapshot.matches("awaitingHuman")) return "person";
  if (snapshot.matches("acting")) return config.subagent && turn?.tool === "lookup_order" ? "subagent" : "server";
  return "gate";
}

function TicketTrace({ log, index, message, notes }: { log: TicketLog; index: number; message: string; notes: readonly string[] }) {
  const { t, formatNumber } = useI18n();
  return (
    <section className="ticket-trace">
      <span className="kicker">{t("agents.ticket", { number: index + 1 })}</span>
      <ol className="docket">
        {notes.length > 0 && (
          <li className="docket__line">
            <div className="slip slip--memory">
              <span className="kicker">{t("agents.notesHeading")}</span>
              <p>{notes.join(" ")}</p>
            </div>
          </li>
        )}
        <li className="docket__line docket__line--customer">
          <p>{message}</p>
        </li>
        {log.turns.map((entry, i) => {
          const step = log.steps[i];
          const turn = entry.turn;
          return (
            <li key={i} className="docket__line">
              {turn?.action === "call_tool" ? (
                <div className="slip slip--call">
                  <span className="kicker">{t("tools.modelAsks")}</span>
                  <pre>{`${turn.tool}(${JSON.stringify(callInput(turn))})`}</pre>
                  {step && <span className={`slip__stamp via--${step.via}`}>{t(`agents.via.${step.via}` as MessageKey)}</span>}
                </div>
              ) : (
                <div className="slip slip--reply">
                  <span className="kicker">{turn ? t("tools.modelReplies") : t("tools.unreadable")}</span>
                  <p>{turn?.reply ?? entry.raw}</p>
                </div>
              )}
              {step && <StepResult step={step} />}
            </li>
          );
        })}
      </ol>
      {log.outcome === "step-limit" && <p className="error-line">{t("tools.outcome.step-limit")}</p>}
      <p className="note">{t("agents.tokens", { agent: formatNumber(log.agentTokens), subagent: formatNumber(log.subagentTokens) })}</p>
    </section>
  );
}

function StepResult({ step }: { step: HarnessStep }) {
  const { t } = useI18n();
  return (
    <div className="slip slip--result">
      <span className="kicker">{t(step.via === "subagent" ? "agents.subagentSays" : "agents.harnessReturned")}</span>
      <pre>{JSON.stringify(step.result)}</pre>
      {step.raw && step.via === "subagent" && (
        <details>
          <summary className="note">{t("agents.rawRecord")}</summary>
          <pre>{JSON.stringify(step.raw)}</pre>
        </details>
      )}
    </div>
  );
}
