import type { LlmTask, UnitProgress } from "./protocol";

export type HostMode = "standalone" | "embedded";

export type HostSession = {
  readonly mode: HostMode;
  readonly locale: string | null;
  readonly theme: Readonly<Record<string, string>>;
  readonly progress: Readonly<Record<string, UnitProgress>>;
  readonly hostLlm: boolean;
};

// The course talks to its host only through this port. Standalone is the default adapter.
export type HostBridge = {
  readonly mode: HostMode;
  start(): Promise<HostSession>;
  unitStarted(unitId: string): void;
  unitCompleted(unitId: string, state: unknown): void;
  courseCompleted(): void;
  resized(height: number): void;
  reportError(code: string, message: string): void;
  onLocaleChange(listener: (locale: string) => void): () => void;
  onThemeChange(listener: (theme: Record<string, string>) => void): () => void;
  askHost(task: LlmTask, input: unknown): Promise<unknown>;
};
