import type { HostBridge, HostSession } from "./HostBridge";
import { createNonce, hostMessageSchema, stateFits, type Capability, type InitMessage, type LlmTask, type ScrollMessage } from "./protocol";

export type EmbeddedOptions = {
  readonly hostOrigin: string;
  readonly scroll: { readonly id: string; readonly version: string };
  readonly capabilities: Capability[];
  readonly target: Pick<Window, "postMessage">;
  readonly expectedSource: unknown;
  readonly listen: (handler: (event: MessageEvent) => void) => () => void;
  readonly initTimeoutMs?: number;
  readonly llmTimeoutMs?: number;
};

export class HandshakeTimeout extends Error {}

export class EmbeddedBridge implements HostBridge {
  readonly mode = "embedded" as const;
  private session: string | null = null;
  private granted = new Set<string>();
  private readonly nonce = createNonce();
  private readonly localeListeners = new Set<(locale: string) => void>();
  private readonly themeListeners = new Set<(theme: Record<string, string>) => void>();
  private readonly pendingLlm = new Map<string, (output: unknown) => void>();
  private unlisten: () => void = () => undefined;
  private requestCounter = 0;
  private lastHeight = -1;

  constructor(private readonly options: EmbeddedOptions) {}

  start(): Promise<HostSession> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.unlisten();
        reject(new HandshakeTimeout("no init from host"));
      }, this.options.initTimeoutMs ?? 3000);
      this.unlisten = this.options.listen((event) => {
        const message = this.accept(event);
        if (!message) return;
        if (message.type === "init") {
          if (this.session || message.nonce !== this.nonce) return;
          clearTimeout(timer);
          resolve(this.onInit(message));
          return;
        }
        if (message.session !== this.session) return;
        if (message.type === "setLocale") this.localeListeners.forEach((listener) => listener(message.locale));
        if (message.type === "setTheme") this.themeListeners.forEach((listener) => listener(message.theme));
        if (message.type === "llmResult") {
          this.pendingLlm.get(message.id)?.(message.output);
          this.pendingLlm.delete(message.id);
        }
      });
      this.post({ dojo: "scroll", v: 0, type: "hello", scroll: this.options.scroll, nonce: this.nonce, capabilities: this.options.capabilities });
    });
  }

  // The spec's strict checks: exact host origin, our parent as source, and a valid message.
  private accept(event: MessageEvent) {
    if (event.origin !== this.options.hostOrigin) return null;
    if (event.source !== this.options.expectedSource) return null;
    const parsed = hostMessageSchema.safeParse(event.data);
    return parsed.success ? parsed.data : null;
  }

  private onInit(message: InitMessage): HostSession {
    this.session = message.session;
    this.granted = new Set(message.capabilities);
    return { mode: "embedded", locale: message.locale, theme: message.theme, progress: message.progress, hostLlm: this.granted.has("llm") };
  }

  private post(message: ScrollMessage): void {
    this.options.target.postMessage(message, this.options.hostOrigin);
  }

  private reportingSession(): string | null {
    return this.granted.has("progress") ? this.session : null;
  }

  unitStarted(unitId: string): void {
    const session = this.reportingSession();
    if (session === null) return;
    this.post({ dojo: "scroll", v: 0, type: "progress", session, unitId, completed: false });
  }

  unitCompleted(unitId: string, state: unknown): void {
    const session = this.reportingSession();
    if (session === null) return;
    const fits = stateFits(state);
    this.post({ dojo: "scroll", v: 0, type: "progress", session, unitId, completed: true, ...(fits ? { state } : {}) });
    this.post({ dojo: "scroll", v: 0, type: "complete", session, unitId });
    if (!fits) this.reportError("invalid-state", `state for ${unitId} exceeds 64 KiB and was not sent`);
  }

  courseCompleted(): void {
    const session = this.reportingSession();
    if (session === null) return;
    this.post({ dojo: "scroll", v: 0, type: "complete", session });
  }

  resized(height: number): void {
    const rounded = Math.min(100_000, Math.max(0, Math.ceil(height)));
    if (this.session === null || rounded === this.lastHeight) return;
    this.lastHeight = rounded;
    this.post({ dojo: "scroll", v: 0, type: "resize", session: this.session, height: rounded });
  }

  reportError(code: string, message: string): void {
    this.post({ dojo: "scroll", v: 0, type: "error", ...(this.session ? { session: this.session } : {}), code, message: message.slice(0, 1000) });
  }

  onLocaleChange(listener: (locale: string) => void): () => void {
    this.localeListeners.add(listener);
    return () => this.localeListeners.delete(listener);
  }

  onThemeChange(listener: (theme: Record<string, string>) => void): () => void {
    this.themeListeners.add(listener);
    return () => this.themeListeners.delete(listener);
  }

  askHost(task: LlmTask, input: unknown): Promise<unknown> {
    const session = this.session;
    if (session === null || !this.granted.has("llm")) return Promise.resolve(null);
    const id = `${task}-${++this.requestCounter}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingLlm.delete(id);
        resolve(null);
      }, this.options.llmTimeoutMs ?? 60_000);
      this.pendingLlm.set(id, (output) => {
        clearTimeout(timer);
        resolve(output);
      });
      this.post({ dojo: "scroll", v: 0, type: "llm", session, id, task, input });
    });
  }
}
