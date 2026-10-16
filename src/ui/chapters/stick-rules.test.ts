import { describe, expect, it } from "vitest";
import type { ConversationTurn } from "../../content/schema";
import { applyRule, type TokenizedTurn } from "./stick-rules";

const piece = (n: number) => Array.from({ length: n }, (_, i) => ({ tokenId: i, text: `t${i}` }));
const turn = (role: ConversationTurn["role"], size: number, fact?: string): TokenizedTurn => ({
  turn: { role, text: "x", ...(fact ? { fact } : {}) },
  pieces: piece(size),
});

const conversation = [turn("system", 4, "rule"), turn("customer", 3, "order"), turn("assistant", 5), turn("customer", 4, "amount")];

describe("applyRule", () => {
  it("keeps everything while it fits", () => {
    const state = applyRule("drop-oldest", conversation, 20, []);
    expect(state.fallen).toBe(0);
    expect([...state.survivingFacts].sort()).toEqual(["amount", "order", "rule"]);
  });

  it("drops the oldest sorts, system message first", () => {
    const state = applyRule("drop-oldest", conversation, 10, []);
    expect(state.kept).toHaveLength(10);
    expect(state.fallen).toBe(6);
    expect([...state.lostFacts].sort()).toEqual(["order", "rule"]);
  });

  it("clamps the system message and drops from the conversation instead", () => {
    const state = applyRule("pin-system", conversation, 10, []);
    expect(state.kept.slice(0, 4).every((s) => s.pinned)).toBe(true);
    expect(state.survivingFacts.has("rule")).toBe(true);
    expect(state.lostFacts.has("order")).toBe(true);
  });

  it("makes room for the summary, which costs sorts too", () => {
    const state = applyRule("pin-summary", conversation, 12, piece(3));
    expect(state.kept).toHaveLength(12);
    expect(state.kept.filter((s) => s.role === "summary")).toHaveLength(3);
    expect(state.fallen).toBe(7);
  });
});
