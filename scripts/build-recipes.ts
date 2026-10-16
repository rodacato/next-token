// Writes recording recipes from content, so recorded requests are byte-identical to what the app sends.
// Usage: npm run recipes (then npm run record:llm -- <recipe>)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { judgeRequest } from "../src/evals/judge.ts";
import { fillTemplate } from "../src/evals/template.ts";
import { jsonSchemaFor, schemas } from "../src/evals/schemas.ts";
import { checkSheet, retryPrompt } from "../src/evals/structured.ts";
import { requestHash } from "../src/llm/hash.ts";
import { branchId, parseTurn, resolveResult, turnRequest, type ResultChoice, type Step } from "../src/agents/toolProtocol.ts";

type PerLocale = Record<string, string>;
type Contender = { id: string; system: PerLocale; template: PerLocale };
type Duel = { id: string; evalSetId: string; contenders: Contender[] };
type EvalCase = { id: string; input: PerLocale };
type Grader = { id: string; kind: string; rubric?: PerLocale; judgeRecipe?: string; labels?: { input: PerLocale; output: PerLocale }; expects?: "pass" | "expected-answer" };
type EvalSet = { id: string; cases: EvalCase[]; graders: Grader[] };
type Request = { id: string; locale: string; system: string; prompt: string; jsonSchema?: Record<string, unknown> };

const root = join(import.meta.dirname, "..");
const recipesDir = join(root, "src", "recordings", "llm", "recipes");
const read = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const locales = ["en", "es-MX"];
const MODEL = "haiku";

function write(id: string, purpose: string, requests: Request[]) {
  writeFileSync(join(recipesDir, `${id}.json`), JSON.stringify({ id, purpose, model: MODEL, repeats: 1, requests }, null, 2) + "\n");
  console.log(`${id}: ${requests.length} requests`);
}

for (const file of readdirSync(join(root, "src", "content", "duels"))) {
  const duel = read<Duel>(join(root, "src", "content", "duels", file));
  const set = read<EvalSet>(join(root, "src", "content", "evals", `${duel.evalSetId}.json`));
  const requests = duel.contenders.flatMap((contender) =>
    set.cases.flatMap((c) =>
      locales.map((locale) => ({
        id: `${contender.id}--${c.id}--${locale}`,
        locale,
        system: contender.system[locale] ?? "",
        prompt: fillTemplate(contender.template[locale] ?? "", c.input[locale] ?? ""),
      })),
    ),
  );
  write(`duel-${duel.id}`, `Duel ${duel.id}: every contender on every case of ${set.id}.`, requests);

  // The judge grades recorded outputs, so its recipe exists only once the duel has been recorded.
  const judge = set.graders.find((g) => g.kind === "llm-judge");
  const recorded = join(root, "src", "recordings", "llm", `duel-${duel.id}.json`);
  if (!judge?.rubric || !judge.judgeRecipe || !judge.labels || !judge.expects || !existsSync(recorded)) continue;
  const judgeGrader = { id: judge.id, kind: "llm-judge" as const, rubric: judge.rubric, labels: judge.labels, expects: judge.expects, judgeRecipe: judge.judgeRecipe };
  const outputs = read<{ completions: { requestId: string; locale: string; output: string }[] }>(recorded).completions;
  const judgeRequests = outputs.map((completion) => {
    const caseId = completion.requestId.split("--")[1] ?? "";
    const evalCase = set.cases.find((c) => c.id === caseId);
    const { system, prompt } = judgeRequest(judgeGrader, completion.locale, evalCase?.input[completion.locale] ?? "", completion.output);
    return { id: `judge--${completion.requestId}`, locale: completion.locale, system, prompt };
  });
  write(judge.judgeRecipe, `LLM judge for duel ${duel.id}, on the recorded outputs.`, judgeRequests);
}

// Structured output: each case asked nicely (prompt only) and constrained (JSON Schema), plus retries.
type StructuredChapter = { id: string; kind: string; schemaId: string; system: PerLocale; template: PerLocale; retry: PerLocale; cases: EvalCase[] };
for (const file of readdirSync(join(root, "src", "content", "chapters"))) {
  const chapter = read<StructuredChapter>(join(root, "src", "content", "chapters", file));
  if (chapter.kind !== "structured") continue;
  const schema = schemas[chapter.schemaId];
  if (!schema) throw new Error(`Unknown schema ${chapter.schemaId}`);
  const jsonSchema = jsonSchemaFor(schema);
  const requests = chapter.cases.flatMap((c) =>
    locales.flatMap((locale) => {
      const base = { locale, system: chapter.system[locale] ?? "", prompt: fillTemplate(chapter.template[locale] ?? "", c.input[locale] ?? "") };
      return [
        { id: `asked--${c.id}--${locale}`, ...base },
        { id: `constrained--${c.id}--${locale}`, ...base, jsonSchema },
      ];
    }),
  );
  write(chapter.id, `Chapter ${chapter.id}: asked nicely vs constrained by JSON Schema.`, requests);

  const recorded = join(root, "src", "recordings", "llm", `${chapter.id}.json`);
  if (!existsSync(recorded)) continue;
  const outputs = read<{ completions: { requestId: string; locale: string; output: string }[] }>(recorded).completions;
  const retries = outputs.flatMap((completion) => {
    const check = checkSheet(completion.output, schema);
    if (check.ok || !completion.requestId.startsWith("asked--")) return [];
    const caseId = completion.requestId.split("--")[1] ?? "";
    const input = chapter.cases.find((c) => c.id === caseId)?.input[completion.locale] ?? "";
    return [{ id: `retry--${completion.requestId}`, locale: completion.locale, system: chapter.system[completion.locale] ?? "", prompt: retryPrompt(chapter.retry[completion.locale] ?? "", input, check.error, completion.output) }];
  });
  if (retries.length) write(`${chapter.id}-retry`, `Chapter ${chapter.id}: one retry for every rejected sheet.`, retries);
}

// Tools: the model's turns form a tree, one branch per result the learner can hand back.
// Each pass adds the turns that the recordings so far make reachable; repeat until nothing is new.
type ToolsChapter = { id: string; kind: string; maxTokens: number; maxSteps: number; system: PerLocale; customer: PerLocale; labels: Record<string, { customer: string; call: string; result: string }>; toolResults: Record<string, ResultChoice[]> };
for (const file of readdirSync(join(root, "src", "content", "chapters"))) {
  const chapter = read<ToolsChapter>(join(root, "src", "content", "chapters", file));
  if (chapter.kind !== "tools") continue;
  const recorded = join(root, "src", "recordings", "llm", `${chapter.id}.json`);
  const outputs = new Map<string, string>();
  if (existsSync(recorded)) for (const c of read<{ completions: { requestHash: string; output: string }[] }>(recorded).completions) outputs.set(c.requestHash, c.output);
  const requests: Request[] = [];
  let missing = 0;
  for (const locale of locales) {
    const labels = chapter.labels[locale];
    if (!labels) throw new Error(`${chapter.id} has no labels for ${locale}`);
    const task = { system: chapter.system[locale] ?? "", customer: chapter.customer[locale] ?? "", labels, maxTokens: chapter.maxTokens };
    const queue: Step[][] = [[]];
    for (let steps = queue.shift(); steps; steps = queue.shift()) {
      const { system, prompt, jsonSchema } = turnRequest(task, steps);
      requests.push({ id: `${locale}--${branchId(steps)}`, locale, system, prompt, jsonSchema });
      const output = outputs.get(requestHash({ system, prompt, jsonSchema }));
      if (output === undefined) {
        missing++;
        continue;
      }
      const turn = parseTurn(output);
      if (!turn || turn.action !== "call_tool" || !turn.tool || steps.length >= chapter.maxSteps) continue;
      for (const choice of chapter.toolResults[turn.tool] ?? []) queue.push([...steps, { call: turn, resultId: choice.id, result: resolveResult(choice, turn) }]);
    }
  }
  write(chapter.id, `Chapter ${chapter.id}: every turn the model takes on every branch of results the learner can return.`, requests);
  console.log(`  ${missing} not recorded yet (record with --extend, then run recipes again)`);
}
