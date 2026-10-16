import { describe, expect, it, vi } from "vitest";
import { EmbeddedBridge, HandshakeTimeout } from "./EmbeddedBridge";
import { hostOriginFrom } from "./connect";
import type { ScrollMessage } from "./protocol";

const HOST = "https://dojo.example";
const parent = { name: "parent" };

function harness(options: { initTimeoutMs?: number } = {}) {
  const sent: ScrollMessage[] = [];
  let handler: (event: MessageEvent) => void = () => undefined;
  const bridge = new EmbeddedBridge({
    hostOrigin: HOST,
    scroll: { id: "next-token", version: "0.1.0" },
    capabilities: ["progress", "llm"],
    target: { postMessage: (message: ScrollMessage, origin: string) => (expect(origin).toBe(HOST), sent.push(message)) } as Pick<Window, "postMessage">,
    expectedSource: parent,
    listen: (h) => ((handler = h), () => undefined),
    ...options,
  });
  const deliver = (data: unknown, origin = HOST, source: unknown = parent) => handler({ data, origin, source } as MessageEvent);
  const hello = () => sent.find((m) => m.type === "hello") as Extract<ScrollMessage, { type: "hello" }>;
  const init = (overrides: Record<string, unknown> = {}) => ({
    dojo: "scroll",
    v: 0,
    type: "init",
    nonce: hello().nonce,
    session: "s-1",
    locale: "es-MX",
    theme: {},
    progress: { tokens: { completed: true } },
    capabilities: ["progress"],
    userRef: "u-1",
    authenticated: true,
    ...overrides,
  });
  return { bridge, sent, deliver, hello, init };
}

describe("EmbeddedBridge", () => {
  it("says hello first and accepts the matching init", async () => {
    const h = harness();
    const started = h.bridge.start();
    expect(h.hello().nonce.length).toBeGreaterThanOrEqual(16);
    expect(h.hello().capabilities).toEqual(["progress", "llm"]);
    h.deliver(h.init());
    const session = await started;
    expect(session).toMatchObject({ mode: "embedded", locale: "es-MX", hostLlm: false });
    expect(session.progress.tokens?.completed).toBe(true);
  });

  it.each([
    ["another origin", { origin: "https://evil.example" }],
    ["another window", { source: { name: "other" } }],
    ["a wrong nonce", { nonce: "x".repeat(36) }],
  ])("ignores an init from %s and falls back after the timeout", async (_label, spoof) => {
    vi.useFakeTimers();
    const h = harness({ initTimeoutMs: 3000 });
    const started = h.bridge.start();
    const { origin, source, nonce } = spoof as { origin?: string; source?: unknown; nonce?: string };
    h.deliver(h.init(nonce ? { nonce } : {}), origin ?? HOST, source ?? parent);
    vi.advanceTimersByTime(3000);
    await expect(started).rejects.toBeInstanceOf(HandshakeTimeout);
    vi.useRealTimers();
  });

  it("carries the session, ignores a replayed init and reports progress only when granted", async () => {
    const h = harness();
    const started = h.bridge.start();
    h.deliver(h.init());
    await started;
    h.deliver(h.init({ session: "s-2" }));
    h.bridge.unitStarted("next-token");
    h.bridge.unitCompleted("next-token", { stage: "debrief" });
    h.bridge.courseCompleted();
    const after = h.sent.filter((m) => m.type !== "hello");
    expect(after.map((m) => m.type)).toEqual(["progress", "progress", "complete", "complete"]);
    expect(after.every((m) => "session" in m && m.session === "s-1")).toBe(true);
  });

  it("does not send progress without the capability, nor llm without a grant", async () => {
    const h = harness();
    const started = h.bridge.start();
    h.deliver(h.init({ capabilities: [] }));
    await started;
    h.bridge.unitStarted("tokens");
    await expect(h.bridge.askHost("complete", {})).resolves.toBeNull();
    expect(h.sent.map((m) => m.type)).toEqual(["hello"]);
  });

  it("drops a state over 64 KiB and says so", async () => {
    const h = harness();
    const started = h.bridge.start();
    h.deliver(h.init());
    await started;
    h.bridge.unitCompleted("tokens", { blob: "x".repeat(70_000) });
    const progress = h.sent.find((m) => m.type === "progress");
    expect(progress && "state" in progress).toBe(false);
    expect(h.sent.at(-1)).toMatchObject({ type: "error", code: "invalid-state" });
  });
});

describe("hostOriginFrom", () => {
  it("needs both a frame and a valid host parameter", () => {
    expect(hostOriginFrom({ search: "?host=https://dojo.example/path" }, true)).toBe(HOST);
    expect(hostOriginFrom({ search: "?host=https://dojo.example" }, false)).toBeNull();
    expect(hostOriginFrom({ search: "" }, true)).toBeNull();
    expect(hostOriginFrom({ search: "?host=not a url" }, true)).toBeNull();
  });
});
