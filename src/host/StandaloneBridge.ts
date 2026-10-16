import type { HostBridge, HostSession } from "./HostBridge";

// Sends nothing, as the protocol requires outside a host; progress stays in localStorage.
export class StandaloneBridge implements HostBridge {
  readonly mode = "standalone" as const;

  start(): Promise<HostSession> {
    return Promise.resolve({ mode: "standalone", locale: null, theme: {}, progress: {}, hostLlm: false });
  }

  unitStarted(): void {}
  unitCompleted(): void {}
  courseCompleted(): void {}
  resized(): void {}
  reportError(): void {}

  onLocaleChange(): () => void {
    return () => undefined;
  }

  onThemeChange(): () => void {
    return () => undefined;
  }

  askHost(): Promise<unknown> {
    return Promise.resolve(null);
  }
}
