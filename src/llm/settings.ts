import { z } from "zod";

export const llmSettingsSchema = z.object({
  provider: z.enum(["recorded", "host", "anthropic", "openai", "openai-compatible"]),
  model: z.string(),
  baseUrl: z.string(),
  apiKey: z.string(),
  remember: z.boolean(),
  customPrice: z.object({ inputPerMTok: z.number().nonnegative(), outputPerMTok: z.number().nonnegative() }).nullable(),
  capUsd: z.number().positive(),
});

export type LlmSettings = z.infer<typeof llmSettingsSchema>;

export const defaultLlmSettings: LlmSettings = {
  provider: "recorded",
  model: "claude-haiku-5-5",
  baseUrl: "",
  apiKey: "",
  remember: false,
  customPrice: null,
  capUsd: 1,
};

const KEY = "next-token:llm";

function stores(): { session?: Storage; local?: Storage } {
  try {
    return { session: globalThis.sessionStorage, local: globalThis.localStorage };
  } catch {
    return {};
  }
}

// Keys live in sessionStorage unless the learner asks to remember them on this device.
export function loadLlmSettings(): LlmSettings {
  const { session, local } = stores();
  try {
    const raw = session?.getItem(KEY) ?? local?.getItem(KEY);
    return raw ? llmSettingsSchema.parse(JSON.parse(raw)) : defaultLlmSettings;
  } catch {
    return defaultLlmSettings;
  }
}

export function saveLlmSettings(settings: LlmSettings): void {
  const { session, local } = stores();
  try {
    const raw = JSON.stringify(settings);
    if (settings.remember) {
      local?.setItem(KEY, raw);
      session?.removeItem(KEY);
    } else {
      session?.setItem(KEY, raw);
      local?.removeItem(KEY);
    }
  } catch {
    // Storage blocked: settings last for this page only.
  }
}

export function forgetLlmSettings(): void {
  const { session, local } = stores();
  try {
    session?.removeItem(KEY);
    local?.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
