import { describe, expect, it } from "vitest";
import { sameTitle, titleOf } from "./record-experiments";

describe("titleOf", () => {
  it("takes the title after the year and before the venue", () => {
    expect(titleOf("Ahia, O. (2023). Do All Languages Cost the Same? In Proceedings of EMNLP 2023.")).toBe("Do All Languages Cost the Same?");
    expect(titleOf("Do All Languages Cost the Same? In Proceedings of EMNLP 2023.")).toBe("Do All Languages Cost the Same?");
    expect(titleOf("Smith, N. A. (2023). Do All Languages Cost the Same? In EMNLP 2023.")).toBe("Do All Languages Cost the Same?");
    expect(titleOf("Pevon, S. (2023). The COST of Languages Other Than English: A Computational Model")).toBe(
      "The COST of Languages Other Than English: A Computational Model",
    );
  });
});

describe("sameTitle", () => {
  it("tolerates case, punctuation and truncation, not different words", () => {
    expect(sameTitle("Do all languages cost the same?", "Do All Languages Cost the Same? Tokenization in the Era")).toBe(true);
    expect(sameTitle("Language Tokenization: Do All Languages Cost The Same?", "Do All Languages Cost the Same? Tokenization in the Era of Commercial Language Models")).toBe(false);
    expect(sameTitle("Language Model Tokenizers Introduce Unfairness Between Languages", "language model tokenizers introduce unfairness between languages")).toBe(true);
  });
});
