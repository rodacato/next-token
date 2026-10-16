import type source from "./locales/en.json";

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Exclude<Leaves<typeof source>, `_meta.${string}`>;
export type Catalog = typeof source;
export type LocaleMeta = Catalog["_meta"];
export type LocaleCode = string;

export const sourceLocale = "en";

// Adding a locale is adding a JSON file to ./locales; nothing else changes.
const files = import.meta.glob<Catalog>("./locales/*.json", { eager: true, import: "default" });

export const catalogs: ReadonlyMap<LocaleCode, Catalog> = new Map(
  Object.entries(files).map(([path, catalog]) => [path.replace(/^.*\/(.+)\.json$/, "$1"), catalog]),
);

export const availableLocales: readonly LocaleCode[] = [...catalogs.keys()].sort((a, b) =>
  a === sourceLocale ? -1 : b === sourceLocale ? 1 : a.localeCompare(b),
);

export function lookup(catalog: Catalog, key: string): string | undefined {
  let node: unknown = catalog;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export type MessageParams = Readonly<Record<string, string | number>>;

export function interpolate(template: string, params: MessageParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function translate(locale: LocaleCode, key: MessageKey, params?: MessageParams): string {
  const catalog = catalogs.get(locale) ?? catalogs.get(sourceLocale);
  const fallback = catalogs.get(sourceLocale);
  const template = (catalog && lookup(catalog, key)) ?? (fallback && lookup(fallback, key)) ?? key;
  return interpolate(template, params);
}

export function detectLocale(preferred: readonly string[]): LocaleCode {
  for (const tag of preferred) {
    const exact = availableLocales.find((code) => code.toLowerCase() === tag.toLowerCase());
    if (exact) return exact;
    const language = tag.split("-")[0]?.toLowerCase();
    const sameLanguage = availableLocales.find((code) => code.split("-")[0]?.toLowerCase() === language);
    if (sameLanguage) return sameLanguage;
  }
  return sourceLocale;
}

export function localeMeta(locale: LocaleCode): LocaleMeta {
  const catalog = catalogs.get(locale) ?? catalogs.get(sourceLocale);
  if (!catalog) throw new Error("The source locale catalog is missing.");
  return catalog._meta;
}
