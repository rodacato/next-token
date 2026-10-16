// The bill: what a day of conversations costs, by component, from the dated price table.
export type ModelPrice = {
  readonly model: string;
  readonly inputPerMTok: number;
  readonly outputPerMTok: number;
  readonly cacheWritePerMTok: number;
  readonly cacheReadPerMTok: number;
};

export type Traffic = {
  readonly conversationsPerDay: number;
  readonly turnsPerConversation: number;
  readonly systemTokens: number;
  readonly contextTokens: number;
  readonly userTokens: number;
  readonly outputTokens: number;
};

export type Routing = { readonly strongShare: number; readonly caching: boolean; readonly cacheHitRate: number };
export type Breakdown = { input: number; cacheWrites: number; cacheReads: number; output: number };
export type Bill = { readonly perDay: Breakdown; readonly totalPerDay: number; readonly perConversation: number; readonly tokensPerDay: number };

const empty = (): Breakdown => ({ input: 0, cacheWrites: 0, cacheReads: 0, output: 0 });
const perM = (tokens: number, price: number) => (tokens * price) / 1_000_000;

// One conversation on one model. The system prompt and the history so far are a stable prefix:
// with caching on, a share of it is read from the cache and the rest is written to it.
export function conversationCost(traffic: Traffic, price: ModelPrice, routing: Routing): Breakdown {
  const out = empty();
  for (let turn = 0; turn < traffic.turnsPerConversation; turn++) {
    const prefix = traffic.systemTokens + turn * (traffic.userTokens + traffic.outputTokens);
    const fresh = traffic.contextTokens + traffic.userTokens;
    if (routing.caching) {
      out.cacheReads += perM(prefix * routing.cacheHitRate, price.cacheReadPerMTok);
      out.cacheWrites += perM(prefix * (1 - routing.cacheHitRate), price.cacheWritePerMTok);
    } else out.input += perM(prefix, price.inputPerMTok);
    out.input += perM(fresh, price.inputPerMTok);
    out.output += perM(traffic.outputTokens, price.outputPerMTok);
  }
  return out;
}

export function dailyBill(traffic: Traffic, cheap: ModelPrice, strong: ModelPrice, routing: Routing): Bill {
  const perDay = empty();
  for (const [price, share] of [
    [cheap, 1 - routing.strongShare],
    [strong, routing.strongShare],
  ] as const) {
    const one = conversationCost(traffic, price, routing);
    for (const key of Object.keys(perDay) as (keyof Breakdown)[]) perDay[key] += one[key] * traffic.conversationsPerDay * share;
  }
  const totalPerDay = perDay.input + perDay.cacheWrites + perDay.cacheReads + perDay.output;
  const turns = traffic.turnsPerConversation;
  const tokensPerConversation = turns * (traffic.systemTokens + traffic.contextTokens + traffic.userTokens + traffic.outputTokens) + ((turns * (turns - 1)) / 2) * (traffic.userTokens + traffic.outputTokens);
  return { perDay, totalPerDay, perConversation: traffic.conversationsPerDay ? totalPerDay / traffic.conversationsPerDay : 0, tokensPerDay: tokensPerConversation * traffic.conversationsPerDay };
}

export type LatencyAssumption = { readonly firstTokenMs: number; readonly tokensPerSecond: number };

// Labelled assumptions, not measurements: time to the first token plus the time to write the reply.
export function replySeconds(latency: LatencyAssumption, outputTokens: number): number {
  return latency.firstTokenMs / 1000 + outputTokens / latency.tokensPerSecond;
}
