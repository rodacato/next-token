import { version } from "../../package.json";
import { EmbeddedBridge, HandshakeTimeout } from "./EmbeddedBridge";
import type { HostBridge, HostSession } from "./HostBridge";
import { COURSE_ID, requestedCapabilities } from "./manifest";
import { StandaloneBridge } from "./StandaloneBridge";

export type Connection = { readonly bridge: HostBridge; readonly session: HostSession };

// Embedded only when framed AND told the host origin; anything else is standalone and silent.
export function hostOriginFrom(location: Pick<Location, "search">, framed: boolean): string | null {
  if (!framed) return null;
  const host = new URLSearchParams(location.search).get("host");
  if (!host) return null;
  try {
    const origin = new URL(host).origin;
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}

let connection: Promise<Connection> | undefined;

// One handshake per page, however many times React mounts the caller.
export function connectToHost(): Promise<Connection> {
  connection ??= connect();
  return connection;
}

async function connect(): Promise<Connection> {
  const framed = window.parent !== window;
  const hostOrigin = hostOriginFrom(window.location, framed);
  if (!hostOrigin) return standalone();

  const bridge = new EmbeddedBridge({
    hostOrigin,
    scroll: { id: COURSE_ID, version },
    capabilities: requestedCapabilities,
    target: window.parent,
    expectedSource: window.parent,
    listen: (handler) => {
      window.addEventListener("message", handler);
      return () => window.removeEventListener("message", handler);
    },
  });
  try {
    return { bridge, session: await bridge.start() };
  } catch (error) {
    if (error instanceof HandshakeTimeout) return standalone();
    throw error;
  }
}

async function standalone(): Promise<Connection> {
  const bridge = new StandaloneBridge();
  return { bridge, session: await bridge.start() };
}
