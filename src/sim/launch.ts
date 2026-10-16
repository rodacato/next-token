import { successRate, type Attack } from "./injection.ts";

export type LaunchPlan = {
  readonly staged: boolean;
  readonly budgetCap: boolean;
  readonly optimized: boolean;
  readonly grounding: boolean;
  readonly outputCheck: boolean;
  readonly defenses: ReadonlySet<string>;
};

export type LaunchWorld = {
  readonly weeks: number;
  readonly conversationsPerDay: number;
  readonly stagedShare: readonly number[];
  readonly trafficMultiplier: readonly number[];
  readonly usdPerConversation: { readonly default: number; readonly optimized: number };
  readonly dailyCapUsd: number;
  readonly mxnPerUsd: number;
  readonly invented: { readonly ungrounded: number; readonly grounded: number; readonly caughtByCheck: number; readonly honoredShare: number; readonly costMxn: number };
  readonly injection: { readonly week: number; readonly attemptsPerAttack: number; readonly baseSuccess: number; readonly costMxn: Readonly<Record<string, number>> };
  readonly checkUsdPerConversation: number;
};

export type Week = {
  readonly week: number;
  readonly conversations: number;
  readonly deflected: number;
  readonly apiUsd: number;
  readonly invented: number;
  readonly honored: number;
  readonly injections: Readonly<Record<string, number>>;
  readonly incidentMxn: number;
  readonly totalMxn: number;
};

// Eight weeks of launch. Costs of mistakes arrive the week after the replies that caused them.
export function simulateLaunch(world: LaunchWorld, plan: LaunchPlan, attacks: readonly Attack[]): { weeks: Week[]; pendingMxn: number } {
  const weeks: Week[] = [];
  let carried = 0;
  for (let w = 0; w < world.weeks; w++) {
    const share = plan.staged ? (world.stagedShare[w] ?? 1) : 1;
    const wanted = world.conversationsPerDay * 7 * share * (world.trafficMultiplier[w] ?? 1);
    const perConversation = (plan.optimized ? world.usdPerConversation.optimized : world.usdPerConversation.default) + (plan.outputCheck ? world.checkUsdPerConversation : 0);
    const affordable = plan.budgetCap ? Math.floor((world.dailyCapUsd * 7) / perConversation) : Infinity;
    const conversations = Math.round(Math.min(wanted, affordable));
    const deflected = Math.round(wanted - conversations);
    const apiUsd = conversations * perConversation;

    const rate = plan.grounding ? world.invented.grounded : world.invented.ungrounded;
    const invented = Math.round(conversations * rate * (plan.outputCheck ? 1 - world.invented.caughtByCheck : 1));
    const honored = Math.round(invented * world.invented.honoredShare);

    const injections: Record<string, number> = {};
    let injectionMxn = 0;
    if (w + 1 === world.injection.week) {
      for (const attack of attacks) {
        const n = Math.round(world.injection.attemptsPerAttack * share * successRate(attack, plan.defenses, world.injection.baseSuccess));
        injections[attack.id] = n;
        injectionMxn += n * (world.injection.costMxn[attack.id] ?? 0);
      }
    }
    const incidentMxn = carried;
    carried = honored * world.invented.costMxn + injectionMxn;
    weeks.push({ week: w + 1, conversations, deflected, apiUsd, invented, honored, injections, incidentMxn, totalMxn: apiUsd * world.mxnPerUsd + incidentMxn });
  }
  return { weeks, pendingMxn: carried };
}
