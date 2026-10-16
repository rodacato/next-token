// Records real Claude answers for a recipe, through the Claude Code CLI on the user's subscription.
// Usage: npm run record:llm -- <recipe-id> [--dry-run | --extend]
import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { requestHash } from "../src/llm/hash.ts";
import { recipeSchema, recordedSetSchema, type RecipeRequest, type RecordedCompletion, type RecordedSet } from "../src/llm/recorded-schema.ts";

const run = promisify(execFile);
const recordingsDir = join(import.meta.dirname, "..", "src", "recordings", "llm");
const recipesDir = join(recordingsDir, "recipes");

type CliResult = {
  result: string;
  structured_output?: unknown;
  is_error: boolean;
  total_cost_usd: number;
  duration_ms: number;
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number };
  modelUsage: Record<string, unknown>;
};

async function ask(model: string, request: RecipeRequest): Promise<CliResult> {
  const args = [
    "-p",
    request.prompt,
    "--model",
    model,
    "--system-prompt",
    request.system,
    "--tools",
    "",
    "--safe-mode",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--output-format",
    "json",
  ];
  if (request.jsonSchema) args.push("--json-schema", JSON.stringify(request.jsonSchema));
  // A neutral working directory keeps any project context out of the request.
  const { stdout } = await run("claude", args, { cwd: tmpdir(), maxBuffer: 16 * 1024 * 1024 });
  const parsed = JSON.parse(stdout) as CliResult;
  if (parsed.is_error) throw new Error(`Claude returned an error for ${request.id}: ${parsed.result}`);
  return parsed;
}

const CONCURRENCY = 4;

async function record(model: string, request: RecipeRequest, attempt: number): Promise<RecordedCompletion> {
  const result = await ask(model, request);
  console.log(`  ${request.id} #${attempt}: ${result.usage.output_tokens} output tokens`);
  return {
    requestId: request.id,
    requestHash: requestHash({ system: request.system, prompt: request.prompt, jsonSchema: request.jsonSchema }),
    locale: request.locale,
    attempt,
    model: Object.keys(result.modelUsage)[0] ?? model,
    system: request.system,
    prompt: request.prompt,
    output: result.structured_output === undefined ? result.result : JSON.stringify(result.structured_output),
    ...(result.structured_output === undefined ? {} : { structured: result.structured_output }),
    usage: {
      inputTokens: result.usage.input_tokens,
      outputTokens: result.usage.output_tokens,
      cacheCreationTokens: result.usage.cache_creation_input_tokens,
      cacheReadTokens: result.usage.cache_read_input_tokens,
    },
    listCostUsd: result.total_cost_usd,
    durationMs: result.duration_ms,
  };
}

async function main() {
  const [recipeId, flag] = process.argv.slice(2);
  if (!recipeId) {
    const available = readdirSync(recipesDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
    console.log(`Usage: npm run record:llm -- <recipe-id> [--dry-run | --extend]\nRecipes: ${available.join(", ")}`);
    process.exit(1);
  }
  const recipe = recipeSchema.parse(JSON.parse(readFileSync(join(recipesDir, `${recipeId}.json`), "utf8")));
  const calls = recipe.requests.length * recipe.repeats;
  console.log(`${recipe.id}: ${calls} calls to ${recipe.model} on your Claude subscription.`);
  if (flag === "--dry-run") return;

  // --extend keeps what is already recorded and asks only for the requests that are new.
  const file = join(recordingsDir, `${recipe.id}.json`);
  const kept = flag === "--extend" && existsSync(file) ? recordedSetSchema.parse(JSON.parse(readFileSync(file, "utf8"))).completions : [];
  const known = new Set(kept.map((c) => c.requestHash));
  const pending = recipe.requests.filter((r) => !known.has(requestHash({ system: r.system, prompt: r.prompt, jsonSchema: r.jsonSchema })));
  if (flag === "--extend") console.log(`  ${kept.length} kept, ${pending.length} to record.`);

  const jobs = pending.flatMap((request) => Array.from({ length: recipe.repeats }, (_, i) => ({ request, attempt: i + 1 })));
  const slots: (RecordedCompletion | undefined)[] = new Array(jobs.length);
  let next = 0;
  // A few calls at a time; results keep the recipe's order regardless of which finishes first.
  const worker = async () => {
    while (next < jobs.length) {
      const index = next++;
      const job = jobs[index];
      if (!job) return;
      slots[index] = await record(recipe.model, job.request, job.attempt);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const fresh = slots.filter((c): c is RecordedCompletion => c !== undefined);
  const wanted = new Set(recipe.requests.map((r) => requestHash({ system: r.system, prompt: r.prompt, jsonSchema: r.jsonSchema })));
  const completions = [...kept.filter((c) => wanted.has(c.requestHash)), ...fresh];

  const set: RecordedSet = {
    recipeId: recipe.id,
    recordedAt: new Date().toISOString().slice(0, 10),
    via: "claude-code-cli",
    temperature: "provider-default",
    completions,
  };
  writeFileSync(file, JSON.stringify(set, null, 2) + "\n");
  const listCost = completions.reduce((sum, c) => sum + c.listCostUsd, 0);
  console.log(`Wrote ${file} (list-price equivalent $${listCost.toFixed(4)}; billed to the subscription, not per token).`);
}

await main();
