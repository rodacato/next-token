import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";
import { useLlm } from "../LlmProvider";
import type { RunState } from "./useEvalRun";

type Props = {
  readonly state: RunState;
  readonly disabled: boolean;
  readonly onStart: () => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
};

// Shows the price before a live run and asks for a yes; recorded runs start at once.
export function RunControls({ state, disabled, onStart, onConfirm, onCancel }: Props) {
  const { t, formatNumber } = useI18n();
  const llm = useLlm();
  const money = (usd: number) => formatNumber(usd, { style: "currency", currency: "USD", maximumFractionDigits: 4 });
  const model = llm.settings.provider === "host" ? t("llm.providers.host") : llm.settings.model;

  return (
    <div className="run-controls" aria-live="polite">
      {(state.status === "idle" || state.status === "done" || state.status === "failed") && (
        <button className="button button--primary" disabled={disabled} onClick={onStart} data-testid="run-eval">
          {llm.live ? t("evals.runLive") : t("evals.run")}
        </button>
      )}
      {state.status === "estimating" && <p className="note">{t("evals.estimating")}</p>}
      {state.status === "confirm" && (
        <div className="cost-slip run-controls__confirm" data-testid="run-confirm">
          <p>
            {state.plan.maxUsd === null
              ? t("evals.confirmUnknown", { calls: state.plan.calls, model })
              : t("evals.confirm", { calls: state.plan.calls, model, usd: money(state.plan.maxUsd), left: money(llm.settings.capUsd - llm.spentUsd) })}
          </p>
          {!state.plan.exact && <p className="note">{t("evals.approximate")}</p>}
          <div className="actions actions--row">
            <button className="button button--primary" disabled={state.plan.maxUsd === null} onClick={onConfirm} data-testid="run-go">
              {t("evals.go")}
            </button>
            <button className="button" onClick={onCancel}>
              {t("evals.cancel")}
            </button>
          </div>
        </div>
      )}
      {state.status === "running" && <p className="note">{t("evals.running", { done: state.done, total: state.total })}</p>}
      {state.status === "failed" && (
        <p className="error-line" data-testid="run-failed">
          {t(`evals.failed.${state.reason}` as MessageKey, { detail: state.detail })}
        </p>
      )}
    </div>
  );
}
