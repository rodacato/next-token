// Records real Claude answers for a recipe, through the Claude Code CLI on the user's subscription.
// Usage: npm run record:llm -- <recipe-id> [--dry-run]
import { execFile } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { requestHash } from "../src/llm/hash.ts";
import { recipeSchema, type RecipeRequest, type RecordedCompletion, type RecordedSet } from "../src/llm/recorded-schema.ts";

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

async function main() {
  const [recipeId, flag] = process.argv.slice(2);
  if (!recipeId) {
    const available = readdirSync(recipesDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
    console.log(`Usage: npm run record:llm -- <recipe-id> [--dry-run]\nRecipes: ${available.join(", ")}`);
    process.exit(1);
  }
  const recipe = recipeSchema.parse(JSON.parse(readFileSync(join(recipesDir, `${recipeId}.json`), "utf8")));
  const calls = recipe.requests.length * recipe.repeats;
  console.log(`${recipe.id}: ${calls} calls to ${recipe.model} on your Claude subscription.`);
  if (flag === "--dry-run") return;

  const completions: RecordedCompletion[] = [];
  for (const request of recipe.requests) {
    for (let attempt = 1; attempt <= recipe.repeats; attempt++) {
      const result = await ask(recipe.model, request);
      completions.push({
        requestId: request.id,
        requestHash: requestHash({ system: request.system, prompt: request.prompt, jsonSchema: request.jsonSchema }),
        locale: request.locale,
        attempt,
        model: Object.keys(result.modelUsage)[0] ?? recipe.model,
        system: request.system,
        prompt: request.prompt,
        output: result.result,
        ...(result.structured_output === undefined ? {} : { structured: result.structured_output }),
        usage: {
          inputTokens: result.usage.input_tokens,
          outputTokens: result.usage.output_tokens,
          cacheCreationTokens: result.usage.cache_creation_input_tokens,
          cacheReadTokens: result.usage.cache_read_input_tokens,
        },
        listCostUsd: result.total_cost_usd,
        durationMs: result.duration_ms,
      });
      console.log(`  ${request.id} #${attempt}: ${result.usage.output_tokens} output tokens`);
    }
  }

  const set: RecordedSet = {
    recipeId: recipe.id,
    recordedAt: new Date().toISOString().slice(0, 10),
    via: "claude-code-cli",
    temperature: "provider-default",
    completions,
  };
  const file = join(recordingsDir, `${recipe.id}.json`);
  writeFileSync(file, JSON.stringify(set, null, 2) + "\n");
  const listCost = completions.reduce((sum, c) => sum + c.listCostUsd, 0);
  console.log(`Wrote ${file} (list-price equivalent $${listCost.toFixed(4)}; billed to the subscription, not per token).`);
}

await main();
