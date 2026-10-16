import { z } from "zod";
import { jsonSchemaFor } from "../evals/schemas.ts";

// What the model writes each turn. Native tool-use APIs parse the same idea into tool_use blocks.
export const turnSchema = z.object({
  action: z.enum(["call_tool", "reply"]),
  tool: z.enum(["lookup_order", "issue_refund"]).optional(),
  orderId: z.string().optional(),
  amountMxn: z.number().optional(),
  reply: z.string().optional(),
});

export type ModelTurn = z.infer<typeof turnSchema>;
export type ToolName = NonNullable<ModelTurn["tool"]>;
export type ResultChoice = { readonly id: string; readonly result: Record<string, unknown>; readonly echoInput?: boolean | undefined };
export type Step = { readonly call: ModelTurn; readonly resultId: string; readonly result: Record<string, unknown> };
export type TranscriptLabels = { readonly customer: string; readonly call: string; readonly result: string };

export function parseTurn(text: string): ModelTurn | null {
  try {
    const parsed = turnSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function callInput(call: ModelTurn): Record<string, unknown> {
  return call.tool === "issue_refund" ? { orderId: call.orderId, amountMxn: call.amountMxn } : { orderId: call.orderId };
}

// What the executor hands back; a refund that runs reports what it refunded.
export function resolveResult(choice: ResultChoice, call: ModelTurn): Record<string, unknown> {
  return choice.echoInput ? { ...choice.result, ...callInput(call) } : choice.result;
}

// The whole exchange so far, as one deterministic prompt; recordings are keyed on it.
export function transcriptPrompt(customer: string, steps: readonly Step[], labels: TranscriptLabels): string {
  const lines = [`${labels.customer}: ${customer}`];
  for (const step of steps) {
    lines.push(`${labels.call}: ${JSON.stringify({ tool: step.call.tool, input: callInput(step.call) })}`);
    lines.push(`${labels.result}: ${JSON.stringify(step.result)}`);
  }
  return lines.join("\n");
}

// The id of a branch in the recorded tree: the result chosen at each step.
export function branchId(steps: readonly Step[]): string {
  return steps.length ? steps.map((s) => s.resultId).join("-") : "start";
}

export const turnJsonSchema = jsonSchemaFor(turnSchema);

export type ToolsTask = { readonly system: string; readonly customer: string; readonly labels: TranscriptLabels; readonly maxTokens: number };

export function turnRequest(task: ToolsTask, steps: readonly Step[]) {
  return { system: task.system, prompt: transcriptPrompt(task.customer, steps, task.labels), jsonSchema: turnJsonSchema, maxTokens: task.maxTokens };
}
