import { z } from "zod";

// Dojo scroll protocol v0 (docs/scrolls/PROTOCOL.md in the Dojo repository). The spec is the contract.
export const PROTOCOL_VERSION = 0;
export const STATE_LIMIT_BYTES = 65_536;

const envelope = { dojo: z.literal("scroll"), v: z.literal(PROTOCOL_VERSION) };
const locale = z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/);

export const capabilities = ["progress", "run", "llm"] as const;
export type Capability = (typeof capabilities)[number];

export const unitProgressSchema = z.object({ completed: z.boolean(), state: z.unknown().optional() });
export type UnitProgress = z.infer<typeof unitProgressSchema>;

export const initSchema = z.object({
  ...envelope,
  type: z.literal("init"),
  nonce: z.string(),
  session: z.string().min(1),
  locale,
  theme: z.record(z.string(), z.string()),
  progress: z.record(z.string(), unitProgressSchema),
  capabilities: z.array(z.string()),
  userRef: z.string().nullable(),
  authenticated: z.boolean(),
});
export type InitMessage = z.infer<typeof initSchema>;

const setLocaleSchema = z.object({ ...envelope, type: z.literal("setLocale"), session: z.string(), locale });
const setThemeSchema = z.object({ ...envelope, type: z.literal("setTheme"), session: z.string(), theme: z.record(z.string(), z.string()) });

export const llmTasks = ["complete", "evaluate-submission"] as const;
export type LlmTask = (typeof llmTasks)[number];

// Not in v0: Dojo reserves `llm` and never grants it. This is our proposal, aligned with It Depends;
// the course sends `llm` only when a host grants the capability.
const llmResultSchema = z.object({
  ...envelope,
  type: z.literal("llmResult"),
  session: z.string(),
  id: z.string(),
  task: z.enum(llmTasks),
  output: z.unknown(),
});

export const hostMessageSchema = z.discriminatedUnion("type", [initSchema, setLocaleSchema, setThemeSchema, llmResultSchema]);
export type HostMessage = z.infer<typeof hostMessageSchema>;

type Envelope = { dojo: "scroll"; v: 0 };
export type ScrollMessage = Envelope &
  (
    | { type: "hello"; scroll: { id: string; version: string }; nonce: string; capabilities: Capability[] }
    | { type: "progress"; session: string; unitId: string; completed?: boolean; state?: unknown }
    | { type: "complete"; session: string; unitId?: string }
    | { type: "resize"; session: string; height: number }
    | { type: "error"; session?: string; code: string; message: string }
    | { type: "llm"; session: string; id: string; task: LlmTask; input: unknown }
  );

export function stateFits(state: unknown): boolean {
  return new TextEncoder().encode(JSON.stringify(state ?? null)).length <= STATE_LIMIT_BYTES;
}

export function createNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
