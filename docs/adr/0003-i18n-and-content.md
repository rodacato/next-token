# 3. Translation files and content files

Date: 2026-10-16 · Status: accepted

## Decision

- Every visible UI string lives in `src/i18n/locales/<locale>.json`. English
  is the source. Adding a locale means adding one file:
  `import.meta.glob` discovers it, and its `_meta` block names it.
- `npm run i18n:check` (run in CI) fails on missing keys, extra keys, empty
  strings and mismatched `{placeholders}`.
- Content entities (chapters, sources) have stable English ids and live in
  `src/content/`, validated with Zod 4 at load and in tests. Adding a
  chapter means adding a JSON file whose `kind` selects an existing engine.
- Language-bound specimen data stays in the content file, keyed by
  language, because it is data rather than UI. That covers the bilingual
  pairs in chapter 1 and the default copy for the fan in chapter 2.
- The content test fails if any chapter lacks its strings in any locale, or
  if a "read next" source has no explanation in some locale.
