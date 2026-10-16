import { assign, createActor, fromPromise, setup } from "xstate";
import type { Refund, ShopConnection } from "./shopServer.ts";
import { callInput, parseTurn, transcriptPrompt, turnJsonSchema, type ModelTurn, type Step, type TranscriptLabels } from "./toolProtocol.ts";

export type RefundPolicy = "allow" | "ask" | "deny";
export const refundPolicies: readonly RefundPolicy[] = ["allow", "ask", "deny"];
export type HarnessConfig = { readonly refundPolicy: RefundPolicy; readonly maxSteps: number; readonly memory: boolean; readonly subagent: boolean };

export type HarnessText = {
  readonly system: string;
  readonly subagentSystem: string;
  readonly labels: TranscriptLabels & { readonly notes: string };
  readonly tickets: readonly { readonly id: string; readonly message: string }[];
  readonly notes: { readonly refunded: string; readonly none: string };
  readonly harnessResults: { readonly blocked: string; readonly declined: string };
  readonly maxTokens: number;
  readonly refundThreshold: number;
};

export type ModelCall = { readonly role: "agent" | "subagent"; readonly system: string; readonly prompt: string; readonly jsonSchema?: Record<string, unknown>; readonly maxTokens: number };
export type ModelReply = { readonly text: string; readonly tokens: number };
export type HarnessDeps = { readonly model: (call: ModelCall) => Promise<ModelReply>; readonly shop: ShopConnection };

export type Via = "tool" | "subagent" | "blocked" | "declined";
export type HarnessStep = Step & { readonly via: Via; readonly raw?: Record<string, unknown> };
export type Turn = { readonly raw: string; readonly turn: ModelTurn | null };
export type Outcome = "reply" | "step-limit" | "unreadable";
export type TicketLog = {
  readonly ticketId: string;
  readonly steps: readonly HarnessStep[];
  readonly turns: readonly Turn[];
  readonly outcome: Outcome | null;
  readonly refunds: readonly Refund[];
  readonly agentTokens: number;
  readonly subagentTokens: number;
};
export type HarnessContext = {
  readonly config: HarnessConfig;
  readonly text: HarnessText;
  readonly tools: string;
  readonly ticketIndex: number;
  readonly notes: readonly string[];
  readonly log: readonly TicketLog[];
  readonly error: string | null;
};
export type HarnessInput = { readonly config: HarnessConfig; readonly text: HarnessText; readonly tools: string };

const freshLog = (ticketId: string): TicketLog => ({ ticketId, steps: [], turns: [], outcome: null, refunds: [], agentTokens: 0, subagentTokens: 0 });
const current = (c: HarnessContext) => c.log[c.ticketIndex] ?? freshLog("");
const lastTurn = (c: HarnessContext) => current(c).turns.at(-1)?.turn ?? null;
const withCurrent = (c: HarnessContext, change: (log: TicketLog) => TicketLog) => c.log.map((log, i) => (i === c.ticketIndex ? change(log) : log));
const overThreshold = (c: HarnessContext) => {
  const turn = lastTurn(c);
  return turn?.tool === "issue_refund" && (turn.amountMxn ?? 0) > c.text.refundThreshold;
};
const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ""));

// What the agent sees: the harness's notes (with memory on), then this ticket's exchange so far.
export function agentCall(c: HarnessContext): ModelCall {
  const ticket = c.text.tickets[c.ticketIndex];
  const notes = c.config.memory && c.notes.length ? `${c.text.labels.notes}:\n${c.notes.join("\n")}\n\n` : "";
  return {
    role: "agent",
    system: c.text.system.replace("{{tools}}", c.tools),
    prompt: notes + transcriptPrompt(ticket?.message ?? "", current(c).steps, c.text.labels),
    jsonSchema: turnJsonSchema,
    maxTokens: c.text.maxTokens,
  };
}

export const subagentCall = (text: HarnessText, raw: Record<string, unknown>): ModelCall => ({ role: "subagent", system: text.subagentSystem, prompt: JSON.stringify(raw), maxTokens: 200 });

function harnessStep(c: HarnessContext, via: "blocked" | "declined"): TicketLog[] {
  const call = lastTurn(c);
  if (!call) return [...c.log];
  return withCurrent(c, (log) => ({ ...log, steps: [...log.steps, { call, via, resultId: via, result: { error: c.text.harnessResults[via] } }] }));
}

type ActOutput = { readonly step: HarnessStep; readonly refund: Refund | null; readonly subagentTokens: number };

export function harnessMachine(deps: HarnessDeps) {
  return setup({
    types: {} as { context: HarnessContext; input: HarnessInput; events: { type: "APPROVE" } | { type: "DECLINE" } },
    actors: {
      think: fromPromise<ModelReply, ModelCall>(({ input }) => deps.model(input)),
      act: fromPromise<ActOutput, { call: ModelTurn; context: HarnessContext }>(async ({ input: { call, context } }) => {
        const raw = await deps.shop.call(call.tool ?? "", callInput(call));
        const refund = call.tool === "issue_refund" && raw.status === "refunded" ? { orderId: call.orderId ?? "", amountMxn: call.amountMxn ?? 0 } : null;
        if (context.config.subagent && call.tool === "lookup_order") {
          const summary = await deps.model(subagentCall(context.text, raw));
          return { step: { call, via: "subagent", resultId: "subagent", result: { summary: summary.text.trim() }, raw }, refund, subagentTokens: summary.tokens };
        }
        return { step: { call, via: "tool", resultId: "tool", result: raw }, refund, subagentTokens: 0 };
      }),
    },
  }).createMachine({
    id: "harness",
    context: ({ input }) => ({ ...input, ticketIndex: 0, notes: [], log: [freshLog(input.text.tickets[0]?.id ?? "")], error: null }),
    initial: "thinking",
    states: {
      thinking: {
        invoke: {
          src: "think",
          input: ({ context }) => agentCall(context),
          onDone: {
            target: "routing",
            actions: assign({
              log: ({ context, event }) =>
                withCurrent(context, (log) => ({ ...log, turns: [...log.turns, { raw: event.output.text, turn: parseTurn(event.output.text) }], agentTokens: log.agentTokens + event.output.tokens })),
            }),
          },
          onError: { target: "failed", actions: assign({ error: ({ event }) => (event.error instanceof Error ? event.error.message : String(event.error)) }) },
        },
      },
      routing: {
        always: [
          { guard: ({ context }) => lastTurn(context) === null, target: "ticketEnd", actions: assign({ log: ({ context }) => withCurrent(context, (l) => ({ ...l, outcome: "unreadable" })) }) },
          { guard: ({ context }) => lastTurn(context)?.action === "reply", target: "ticketEnd", actions: assign({ log: ({ context }) => withCurrent(context, (l) => ({ ...l, outcome: "reply" })) }) },
          { guard: ({ context }) => current(context).steps.length >= context.config.maxSteps, target: "ticketEnd", actions: assign({ log: ({ context }) => withCurrent(context, (l) => ({ ...l, outcome: "step-limit" })) }) },
          { guard: ({ context }) => overThreshold(context) && context.config.refundPolicy === "deny", target: "thinking", actions: assign({ log: ({ context }) => harnessStep(context, "blocked") }) },
          { guard: ({ context }) => overThreshold(context) && context.config.refundPolicy === "ask", target: "awaitingHuman" },
          { target: "acting" },
        ],
      },
      awaitingHuman: {
        on: {
          APPROVE: "acting",
          DECLINE: { target: "thinking", actions: assign({ log: ({ context }) => harnessStep(context, "declined") }) },
        },
      },
      acting: {
        invoke: {
          src: "act",
          input: ({ context }) => ({ call: lastTurn(context) ?? { action: "reply" as const }, context }),
          onDone: {
            target: "thinking",
            actions: assign({
              log: ({ context, event }) =>
                withCurrent(context, (log) => ({
                  ...log,
                  steps: [...log.steps, event.output.step],
                  refunds: event.output.refund ? [...log.refunds, event.output.refund] : log.refunds,
                  subagentTokens: log.subagentTokens + event.output.subagentTokens,
                })),
            }),
          },
          onError: { target: "failed", actions: assign({ error: ({ event }) => (event.error instanceof Error ? event.error.message : String(event.error)) }) },
        },
      },
      ticketEnd: {
        entry: assign({
          notes: ({ context }) => {
            const log = current(context);
            const ticket = context.ticketIndex + 1;
            const lines = log.refunds.length
              ? log.refunds.map((r) => fill(context.text.notes.refunded, { ticket, orderId: r.orderId, amount: r.amountMxn.toLocaleString("en-US") }))
              : [fill(context.text.notes.none, { ticket })];
            return [...context.notes, ...lines];
          },
        }),
        always: [
          {
            guard: ({ context }) => context.ticketIndex + 1 < context.text.tickets.length,
            target: "thinking",
            actions: assign({
              ticketIndex: ({ context }) => context.ticketIndex + 1,
              log: ({ context }) => [...context.log, freshLog(context.text.tickets[context.ticketIndex + 1]?.id ?? "")],
            }),
          },
          { target: "done" },
        ],
      },
      done: { type: "final" },
      failed: { type: "final" },
    },
  });
}

export type HarnessMachine = ReturnType<typeof harnessMachine>;

export const toolList = (shop: ShopConnection) => shop.tools.map((t) => `- ${t.name}(${t.name === "issue_refund" ? "orderId, amountMxn" : "orderId"}): ${t.description}`).join("\n");

// Runs the whole queue headless; `decide` plays the person the harness asks. null leaves the run waiting.
export function runHarness(deps: HarnessDeps, input: HarnessInput, decide: (call: ModelTurn, asked: number) => "approve" | "decline" | null) {
  return new Promise<{ context: HarnessContext; waiting: boolean }>((resolve) => {
    const actor = createActor(harnessMachine(deps), { input });
    let asked = 0;
    actor.subscribe((snapshot) => {
      if (snapshot.status === "done") resolve({ context: snapshot.context, waiting: false });
      else if (snapshot.matches("awaitingHuman")) {
        const call = lastTurn(snapshot.context);
        const decision = call ? decide(call, asked++) : null;
        if (decision === null) {
          actor.stop();
          resolve({ context: snapshot.context, waiting: true });
        } else queueMicrotask(() => actor.send({ type: decision === "approve" ? "APPROVE" : "DECLINE" }));
      }
    });
    actor.start();
  });
}

type PerLocale = Readonly<Record<string, string>>;
export type AgentsContent = {
  readonly maxTokens: number;
  readonly refundThreshold: number;
  readonly system: PerLocale;
  readonly subagent: PerLocale;
  readonly labels: Readonly<Record<string, TranscriptLabels & { readonly notes: string }>>;
  readonly tickets: readonly { readonly id: string; readonly message: PerLocale }[];
  readonly notes: { readonly refunded: PerLocale; readonly none: PerLocale };
  readonly harnessResults: { readonly blocked: PerLocale; readonly declined: PerLocale };
};

// One builder for the app and the recipe generator, so recorded prompts match byte for byte.
export function harnessText(content: AgentsContent, locale: string): HarnessText {
  const labels = content.labels[locale];
  if (!labels) throw new Error(`No harness labels for ${locale}`);
  return {
    system: content.system[locale] ?? "",
    subagentSystem: content.subagent[locale] ?? "",
    labels,
    tickets: content.tickets.map((t) => ({ id: t.id, message: t.message[locale] ?? "" })),
    notes: { refunded: content.notes.refunded[locale] ?? "", none: content.notes.none[locale] ?? "" },
    harnessResults: { blocked: content.harnessResults.blocked[locale] ?? "", declined: content.harnessResults.declined[locale] ?? "" },
    maxTokens: content.maxTokens,
    refundThreshold: content.refundThreshold,
  };
}
