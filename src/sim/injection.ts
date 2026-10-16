// The injection lab: a fixed matrix of attacks against defenses. No model runs here; the point is the shape.
export type Effect = "blocks" | "weakens" | "none";
export type Attack = { readonly id: string; readonly vector: "customer" | "review" | "tool-result"; readonly goal: string; readonly effects: Readonly<Record<string, Effect>> };
export type Verdict = "blocked" | "sometimes" | "succeeds";

// Any defense that blocks stops it. Defenses that only weaken leave it working some of the time.
export function verdict(attack: Attack, enabled: ReadonlySet<string>): Verdict {
  const effects = [...enabled].map((d) => attack.effects[d] ?? "none");
  if (effects.includes("blocks")) return "blocked";
  return effects.includes("weakens") ? "sometimes" : "succeeds";
}

// The share of attempts that get through in the launch simulation: each weakening defense halves it.
export function successRate(attack: Attack, enabled: ReadonlySet<string>, base: number): number {
  const v = verdict(attack, enabled);
  if (v === "blocked") return 0;
  const weakening = [...enabled].filter((d) => attack.effects[d] === "weakens").length;
  return base / 2 ** weakening;
}
