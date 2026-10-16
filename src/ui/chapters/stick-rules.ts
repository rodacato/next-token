import type { ConversationTurn } from "../../content/schema";
import type { TokenPiece } from "../../model/protocol";

export type StickRule = "drop-oldest" | "pin-system" | "pin-summary";
export const stickRules: readonly StickRule[] = ["drop-oldest", "pin-system", "pin-summary"];

export type SetSort = TokenPiece & { readonly key: string; readonly turn: number; readonly role: ConversationTurn["role"] | "summary"; readonly pinned: boolean };

export type TokenizedTurn = { readonly turn: ConversationTurn; readonly pieces: readonly TokenPiece[] };

export type StickState = {
  readonly kept: readonly SetSort[];
  readonly fallen: number;
  readonly survivingFacts: ReadonlySet<string>;
  readonly lostFacts: ReadonlySet<string>;
};

function sortsOf(turns: readonly TokenizedTurn[], indexOffset = 0): SetSort[] {
  return turns.flatMap(({ turn, pieces }, i) =>
    pieces.map((piece, j) => ({ ...piece, key: `${indexOffset + i}:${j}`, turn: indexOffset + i, role: turn.role, pinned: false })),
  );
}

// A fact survives only if every sort of the turn that carries it is still on the stick.
function factsFrom(turns: readonly TokenizedTurn[], kept: readonly SetSort[], offset = 0) {
  const survivingFacts = new Set<string>();
  const lostFacts = new Set<string>();
  turns.forEach(({ turn, pieces }, i) => {
    if (!turn.fact) return;
    const onStick = kept.filter((s) => s.turn === offset + i && s.role !== "summary").length;
    (onStick === pieces.length ? survivingFacts : lostFacts).add(turn.fact);
  });
  return { survivingFacts, lostFacts };
}

export function applyRule(rule: StickRule, turns: readonly TokenizedTurn[], capacity: number, summary: readonly TokenPiece[]): StickState {
  const all = sortsOf(turns);
  if (all.length <= capacity) return { kept: all, fallen: 0, ...factsFrom(turns, all) };

  if (rule === "drop-oldest") {
    const kept = all.slice(all.length - capacity);
    return { kept, fallen: all.length - capacity, ...factsFrom(turns, kept) };
  }

  const systemTurns = turns.filter(({ turn }) => turn.role === "system").length;
  const pinned = all.filter((s) => s.turn < systemTurns).map((s) => ({ ...s, pinned: true }));
  let rest = all.filter((s) => s.turn >= systemTurns);
  let lead: SetSort[] = [];
  if (rule === "pin-summary") {
    lead = summary.map((piece, j) => ({ ...piece, key: `summary:${j}`, turn: -1, role: "summary" as const, pinned: true }));
  }
  const room = Math.max(0, capacity - pinned.length - lead.length);
  const fallen = Math.max(0, rest.length - room);
  rest = rest.slice(fallen);
  const kept = [...pinned, ...lead, ...rest];
  return { kept, fallen, ...factsFrom(turns, kept) };
}
