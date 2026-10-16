import { rng, seedFor } from "./rng.ts";

export type Safeguard = "streaming" | "uncertainty" | "refusal" | "undo" | "lastWord";
export const safeguards: readonly Safeguard[] = ["streaming", "uncertainty", "refusal", "undo", "lastWord"];
export type Design = Readonly<Record<Safeguard, boolean>>;

export type FailureModel = {
  readonly conversations: number;
  readonly seed: number;
  readonly right: number;
  readonly wrong: number;
  readonly actionShare: number;
  readonly replySeconds: readonly [number, number];
  readonly firstTokenSeconds: number;
  readonly patienceSeconds: readonly [number, number];
  readonly guessRight: number;
  readonly flaggedWrong: number;
  readonly checkedWhenFlagged: number;
  readonly noticedForUndo: number;
  readonly caughtAtConfirm: number;
};

export type FailureOutcome = {
  readonly harm: number;
  readonly abandoned: number;
  readonly toPerson: number;
  readonly undone: number;
  readonly caught: number;
  readonly extraSteps: number;
};

// One conversation's dice are fixed by its number; the design decides what they lead to.
export function simulateFailure(model: FailureModel, design: Design): FailureOutcome {
  let harm = 0;
  let abandoned = 0;
  let toPerson = 0;
  let undone = 0;
  let caught = 0;
  let extraSteps = 0;
  for (let i = 0; i < model.conversations; i++) {
    const r = rng(seedFor(model.seed, i));
    const kind = r.next();
    const acts = r.chance(model.actionShare);
    const wait = r.between(...model.replySeconds);
    const patience = r.between(...model.patienceSeconds);
    const guess = r.chance(model.guessRight);
    const flagged = r.chance(model.flaggedWrong);
    const checks = r.chance(model.checkedWhenFlagged);
    const notices = r.chance(model.noticedForUndo);
    const catches = r.chance(model.caughtAtConfirm);

    if ((design.streaming ? model.firstTokenSeconds : wait) > patience) {
      abandoned++;
      continue;
    }
    let wrong = kind >= model.right && kind < model.right + model.wrong;
    const unsure = kind >= model.right + model.wrong;
    if (unsure) {
      // Without an honest "I don't know", an unsure model guesses.
      if (design.refusal) {
        toPerson++;
        continue;
      }
      wrong = !guess;
    }
    if (!wrong) continue;
    if (design.uncertainty && flagged && checks) {
      caught++;
      continue;
    }
    if (acts && design.lastWord) {
      extraSteps++;
      if (catches) {
        caught++;
        continue;
      }
    }
    if (acts && design.undo && notices) {
      undone++;
      continue;
    }
    harm++;
  }
  // Confirming an action costs every customer who takes one a step, right or wrong.
  if (design.lastWord) extraSteps = Math.round(model.conversations * model.actionShare);
  return { harm, abandoned, toPerson, undone, caught, extraSteps };
}

export const none: Design = { streaming: false, uncertainty: false, refusal: false, undo: false, lastWord: false };
export const only = (s: Safeguard): Design => ({ ...none, [s]: true });
