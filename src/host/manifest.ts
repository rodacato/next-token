import { PROTOCOL_VERSION, type Capability } from "./protocol.ts";

export const COURSE_ID = "next-token";

export const requiredCapabilities: Capability[] = ["progress"];
// Requested but optional: without a host model the course uses the learner's key or recorded runs.
export const optionalCapabilities: Capability[] = ["llm"];
export const requestedCapabilities: Capability[] = [...requiredCapabilities, ...optionalCapabilities];

export type ManifestInput = {
  readonly version: string;
  readonly chapterIds: readonly string[];
  readonly catalogs: Readonly<Record<string, unknown>>;
};

export type CourseManifest = {
  id: string;
  version: string;
  protocol: number;
  entry: string;
  locales: string[];
  title: Record<string, string>;
  description: Record<string, string>;
  programmingLanguages: string[];
  units: { id: string; title: Record<string, string> }[];
  capabilities: Capability[];
  requiredCapabilities: Capability[];
  optionalCapabilities: Capability[];
};

function text(catalog: unknown, key: string): string {
  let node = catalog;
  for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
  if (typeof node !== "string" || node.length === 0) throw new Error(`Missing manifest string ${key}`);
  return node;
}

export function buildManifest({ version, chapterIds, catalogs }: ManifestInput): CourseManifest {
  const locales = Object.keys(catalogs).sort((a, b) => (a === "en" ? -1 : b === "en" ? 1 : a.localeCompare(b)));
  const perLocale = (key: string) => Object.fromEntries(locales.map((locale) => [locale, text(catalogs[locale], key)]));
  return {
    id: COURSE_ID,
    version,
    protocol: PROTOCOL_VERSION,
    entry: "./index.html",
    locales,
    title: perLocale("course.title"),
    description: perLocale("course.description"),
    programmingLanguages: [],
    units: chapterIds.map((id) => ({ id, title: perLocale(`chapters.${id}.title`) })),
    capabilities: requestedCapabilities,
    requiredCapabilities,
    optionalCapabilities,
  };
}
