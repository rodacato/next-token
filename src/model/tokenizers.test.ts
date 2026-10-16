import { describe, expect, it } from "vitest";
import { sortFace } from "./tokenizers";

describe("sortFace", () => {
  it("marks the leading space that travels with a sort", () => {
    expect(sortFace(" door")).toEqual({ label: "·door", leadingSpace: true, fragment: false });
  });

  it("gives whitespace-only sorts a visible face", () => {
    expect(sortFace(" ").label).toBe("␣");
    expect(sortFace("\n").label).toBe("↵");
  });

  it("flags a piece of a multi-byte character", () => {
    expect(sortFace("�").fragment).toBe(true);
  });
});
