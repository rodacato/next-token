import type { Completion, CompletionRequest, CostEstimate, LlmPort } from "./port";
import { costUsd, type Price } from "./pricing";

export class BudgetExceededError extends Error {
  constructor(
    readonly capUsd: number,
    readonly spentUsd: number,
    readonly neededUsd: number,
  ) {
    super("budget-exceeded");
  }
}

export class UnknownPriceError extends Error {
  constructor(readonly model: string) {
    super("unknown-price");
  }
}

// Every live call is priced before it runs and counted after; past the session cap it refuses.
export class SessionBudget {
  private spent = 0;
  private readonly listeners = new Set<(spentUsd: number) => void>();

  constructor(private cap: number) {}

  get capUsd(): number {
    return this.cap;
  }

  get spentUsd(): number {
    return this.spent;
  }

  setCap(capUsd: number): void {
    this.cap = capUsd;
    this.notify();
  }

  subscribe(listener: (spentUsd: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reserve(maxUsd: number): void {
    if (this.spent + maxUsd > this.cap) throw new BudgetExceededError(this.cap, this.spent, maxUsd);
  }

  record(usd: number): void {
    this.spent += usd;
    this.notify();
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.spent));
  }
}

export function guarded(port: LlmPort, budget: SessionBudget, price: Price | null): LlmPort {
  const priced = async (request: CompletionRequest): Promise<CostEstimate> => {
    const estimate = await port.estimate(request);
    return { ...estimate, maxUsd: price ? costUsd(price, estimate.inputTokens, estimate.maxOutputTokens) : null };
  };
  return {
    provider: port.provider,
    model: port.model,
    estimate: priced,
    async complete(request, signal): Promise<Completion> {
      if (!price) throw new UnknownPriceError(port.model);
      const estimate = await priced(request);
      budget.reserve(estimate.maxUsd ?? 0);
      const completion = await port.complete(request, signal);
      budget.record(costUsd(price, completion.usage.inputTokens, completion.usage.outputTokens));
      return completion;
    },
  };
}
