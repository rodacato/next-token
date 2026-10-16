import { useI18n } from "../../i18n/I18nProvider";
import { localModels, type LocalModel, type ModelDevice } from "../../model/registry";
import type { CompositorState } from "../useCompositor";

type Props = {
  readonly state: CompositorState;
  readonly device: ModelDevice;
  readonly modelId: LocalModel["id"];
  readonly onChooseModel: (id: LocalModel["id"]) => void;
  readonly onLoad: () => void;
  readonly elapsed: { readonly ms: number; readonly tokens: number } | null;
};

export function CompositorPanel({ state, device, modelId, onChooseModel, onLoad, elapsed }: Props) {
  const { t, formatBytes, formatNumber } = useI18n();

  if (state.status === "live") {
    return (
      <div className="compositor-panel compositor-panel--live" data-testid="compositor-live">
        <span className="kicker">{t("model.ready", { name: state.compositor.source.model, device: t(`model.device.${device}`) })}</span>
        {elapsed && <span className="note">{t("model.elapsed", { ms: formatNumber(Math.round(elapsed.ms)), tokens: elapsed.tokens })}</span>}
      </div>
    );
  }

  if (state.status === "loading") {
    const loaded = state.progress?.loaded ?? 0;
    const total = state.progress?.total ?? 0;
    return (
      <div className="compositor-panel" data-testid="compositor-loading">
        <span className="kicker">
          {total > 0 ? t("model.loading", { loaded: formatBytes(loaded), total: formatBytes(total) }) : t("model.loadingUnknown")}
        </span>
        <div className="casting-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={loaded}>
          <span style={{ width: `${total > 0 ? (loaded / total) * 100 : 4}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="compositor-panel" data-testid="compositor-optin">
      <h3>{t("model.title")}</h3>
      <p className="note">{t("model.body")}</p>
      <div className="model-choices" role="radiogroup" aria-label={t("model.title")}>
        {localModels.map((model) => (
          <label key={model.id} className={`model-choice${model.id === modelId ? " is-chosen" : ""}`}>
            <input type="radio" name="model" checked={model.id === modelId} onChange={() => onChooseModel(model.id)} />
            <span className="model-choice__name">{model.name}</span>
            <span className="note">
              {t("model.size", { size: formatBytes(model.variants[device].bytes) })} · {t(`model.device.${device}`)} · {t("model.license", { license: model.license })}
            </span>
            <span className="note">{model.multilingual ? t("model.multilingual") : t("model.englishOnly")}</span>
          </label>
        ))}
      </div>
      <button className="button button--press" onClick={onLoad} data-testid="load-model">
        {t("model.load", { name: localModels.find((m) => m.id === modelId)?.name ?? "" })}
      </button>
      {state.status === "failed" && <p className="error-line">{t("model.failed", { reason: state.reason })}</p>}
    </div>
  );
}
