import { useId } from "react";
import type { MessageKey } from "../i18n/catalog";
import { useI18n } from "../i18n/I18nProvider";
import { priceTable } from "../llm/pricing";
import type { LlmSettings } from "../llm/settings";
import { useLlm } from "./LlmProvider";

const providers: LlmSettings["provider"][] = ["recorded", "host", "anthropic", "openai", "openai-compatible"];

// Where the shop sends work it can't set itself: recorded runs by default, or a live model the learner chose.
export function OutsideWork() {
  const { t, formatNumber } = useI18n();
  const llm = useLlm();
  const { settings, update } = llm;
  const id = useId();
  const money = (usd: number) => formatNumber(usd, { style: "currency", currency: "USD", maximumFractionDigits: 4 });
  const summary =
    settings.provider === "recorded" || !llm.live
      ? t("llm.summaryRecorded")
      : t("llm.summaryLive", { model: settings.provider === "host" ? t("llm.providers.host") : settings.model, spent: money(llm.spentUsd), cap: money(settings.capUsd) });

  return (
    <details className="outside-work" data-testid="outside-work">
      <summary>
        <span className="kicker">{t("llm.title")}</span> <span>{summary}</span>
      </summary>
      <fieldset className="outside-work__providers">
        <legend className="visually-hidden">{t("llm.title")}</legend>
        {providers
          .filter((p) => p !== "host" || llm.hostAvailable)
          .map((provider) => (
            <label key={provider} className={`rule-plate${settings.provider === provider ? " is-chosen" : ""}`}>
              <input type="radio" name={`${id}-provider`} checked={settings.provider === provider} onChange={() => update({ provider, model: provider === "anthropic" ? "claude-haiku-5-5" : settings.model })} />
              {t(`llm.providers.${provider}` as MessageKey)}
            </label>
          ))}
      </fieldset>

      {settings.provider === "anthropic" && (
        <label className="field">
          <span>{t("llm.model")}</span>
          <select value={settings.model} onChange={(e) => update({ model: e.target.value })}>
            {priceTable.models.map((m) => (
              <option key={m.model} value={m.model}>
                {m.label} · {money(m.inputPerMTok)} / {money(m.outputPerMTok)}
              </option>
            ))}
          </select>
        </label>
      )}
      {(settings.provider === "openai" || settings.provider === "openai-compatible") && (
        <>
          {settings.provider === "openai-compatible" && (
            <label className="field">
              <span>{t("llm.baseUrl")}</span>
              <input value={settings.baseUrl} placeholder="http://localhost:11434/v1" onChange={(e) => update({ baseUrl: e.target.value })} />
            </label>
          )}
          <label className="field">
            <span>{t("llm.model")}</span>
            <input value={settings.model} onChange={(e) => update({ model: e.target.value })} />
          </label>
          <div className="field field--pair">
            <label>
              <span>{t("llm.priceIn")}</span>
              <input type="number" min="0" step="0.01" value={settings.customPrice?.inputPerMTok ?? ""} onChange={(e) => update({ customPrice: { inputPerMTok: Number(e.target.value), outputPerMTok: settings.customPrice?.outputPerMTok ?? 0 } })} />
            </label>
            <label>
              <span>{t("llm.priceOut")}</span>
              <input type="number" min="0" step="0.01" value={settings.customPrice?.outputPerMTok ?? ""} onChange={(e) => update({ customPrice: { inputPerMTok: settings.customPrice?.inputPerMTok ?? 0, outputPerMTok: Number(e.target.value) } })} />
            </label>
          </div>
        </>
      )}
      {(settings.provider === "anthropic" || settings.provider === "openai" || settings.provider === "openai-compatible") && (
        <>
          <label className="field">
            <span>{t("llm.key")}</span>
            <input type="password" autoComplete="off" value={settings.apiKey} onChange={(e) => update({ apiKey: e.target.value })} />
          </label>
          <p className="note outside-work__warning">{t("llm.keyWarning")}</p>
          <label className="check">
            <input type="checkbox" checked={settings.remember} onChange={(e) => update({ remember: e.target.checked })} />
            {t("llm.remember")}
          </label>
        </>
      )}
      {settings.provider !== "recorded" && (
        <div className="field field--pair">
          <label>
            <span>{t("llm.cap")}</span>
            <input type="number" min="0.01" step="0.5" value={settings.capUsd} onChange={(e) => Number(e.target.value) > 0 && update({ capUsd: Number(e.target.value) })} />
          </label>
          <span className="note">{t("llm.spent", { spent: money(llm.spentUsd) })}</span>
        </div>
      )}
      {settings.provider === "anthropic" && <p className="note">{t("llm.priceSource", { date: priceTable.asOf })}</p>}
      {settings.apiKey && (
        <button className="button button--quiet" onClick={llm.forget}>
          {t("llm.forget")}
        </button>
      )}
    </details>
  );
}
