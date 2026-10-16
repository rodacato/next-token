import { describe, expect, it } from "vitest";
import { compareCatalogs, flatten } from "./check-i18n";

describe("compareCatalogs", () => {
  const source = flatten({ a: "Hello {name}", b: { c: "Bye" } });

  it("passes a complete translation", () => {
    expect(compareCatalogs(source, flatten({ a: "Hola {name}", b: { c: "Adiós" } }))).toEqual([]);
  });

  it("reports missing, extra and broken placeholders", () => {
    expect(compareCatalogs(source, flatten({ a: "Hola", d: "?" }))).toEqual([
      "placeholders differ in a",
      "missing b.c",
      "extra d",
    ]);
  });
});
