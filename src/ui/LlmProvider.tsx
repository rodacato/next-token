import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { connectToHost } from "../host/connect";
import type { HostBridge } from "../host/HostBridge";
import { anthropicAdapter } from "../llm/adapters/anthropic";
import { hostAdapter } from "../llm/adapters/host";
import { openAiAdapter } from "../llm/adapters/openai";
import { recordedAdapter } from "../llm/adapters/recorded";
import { guarded, SessionBudget } from "../llm/costGuard";
import type { LlmPort } from "../llm/port";
import { listedPrice, type Price } from "../llm/pricing";
import { forgetLlmSettings, loadLlmSettings, saveLlmSettings, type LlmSettings } from "../llm/settings";

const loadRecordedSets = () => import("../llm/recorded").then((m) => m.recordedSets);

type Llm = {
  readonly settings: LlmSettings;
  readonly update: (change: Partial<LlmSettings>) => void;
  readonly forget: () => void;
  readonly port: LlmPort;
  readonly recorded: LlmPort;
  readonly live: boolean;
  readonly price: Price | null;
  readonly budget: SessionBudget;
  readonly spentUsd: number;
  readonly hostAvailable: boolean;
};

const LlmContext = createContext<Llm | null>(null);

export function LlmProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<LlmSettings>(loadLlmSettings);
  const [host, setHost] = useState<HostBridge | null>(null);
  const [budget] = useState(() => new SessionBudget(settings.capUsd));
  const [spentUsd, setSpentUsd] = useState(0);

  useEffect(() => budget.subscribe(setSpentUsd), [budget]);
  useEffect(() => {
    let current = true;
    void connectToHost().then((conn) => current && conn.session.hostLlm && setHost(conn.bridge));
    return () => {
      current = false;
    };
  }, []);

  const value = useMemo<Llm>(() => {
    const recorded = recordedAdapter(loadRecordedSets);
    const price = settings.provider === "anthropic" ? listedPrice(settings.model) : settings.customPrice;
    const raw = rawPort(settings, host);
    return {
      settings,
      update: (change) =>
        setSettings((s) => {
          const next = { ...s, ...change };
          saveLlmSettings(next);
          if (change.capUsd !== undefined) budget.setCap(change.capUsd);
          return next;
        }),
      forget: () => {
        forgetLlmSettings();
        setSettings((s) => ({ ...s, apiKey: "", remember: false, provider: "recorded" }));
      },
      port: raw ? guarded(raw, budget, settings.provider === "host" ? { inputPerMTok: 0, outputPerMTok: 0 } : price) : recorded,
      recorded,
      live: raw !== null,
      price,
      budget,
      spentUsd,
      hostAvailable: host !== null,
    };
  }, [settings, host, budget, spentUsd]);

  return <LlmContext.Provider value={value}>{children}</LlmContext.Provider>;
}

function rawPort(settings: LlmSettings, host: HostBridge | null): LlmPort | null {
  switch (settings.provider) {
    case "recorded":
      return null;
    case "host":
      return host ? hostAdapter(host) : null;
    case "anthropic":
      return settings.apiKey ? anthropicAdapter(settings.apiKey, settings.model) : null;
    case "openai":
      return settings.apiKey ? openAiAdapter(settings.apiKey, settings.model) : null;
    case "openai-compatible":
      return settings.baseUrl ? openAiAdapter(settings.apiKey || "none", settings.model, settings.baseUrl) : null;
  }
}

export function useLlm(): Llm {
  const value = useContext(LlmContext);
  if (!value) throw new Error("useLlm must be used inside LlmProvider.");
  return value;
}
