import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { localeMeta, translate, type LocaleCode, type MessageKey, type MessageParams } from "./catalog";

type I18n = {
  readonly locale: LocaleCode;
  readonly t: (key: MessageKey, params?: MessageParams) => string;
  readonly formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  readonly formatBytes: (bytes: number) => string;
};

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ locale, children }: { locale: LocaleCode; children: ReactNode }) {
  const value = useMemo<I18n>(() => {
    const htmlLang = localeMeta(locale).htmlLang;
    const formatNumber = (n: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(htmlLang, options).format(n);
    return {
      locale,
      t: (key, params) => translate(locale, key, params),
      formatNumber,
      formatBytes: (bytes) =>
        translate(locale, "units.megabytes", { value: formatNumber(bytes / 1_000_000, { maximumFractionDigits: 1 }) }),
    };
  }, [locale]);

  useEffect(() => {
    document.documentElement.lang = localeMeta(locale).htmlLang;
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider.");
  return value;
}
