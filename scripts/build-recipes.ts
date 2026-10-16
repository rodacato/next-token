// Writes recording recipes from content, so recorded requests are byte-identical to what the app sends.
// Usage: npm run recipes (then npm run record:llm -- <recipe>)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { judgeRequest } from "../src/evals/judge.ts";
import { fillTemplate } from "../src/evals/template.ts";

type PerLocale = Record<string, string>;
type Contender = { id: string; system: PerLocale; template: PerLocale };
type Duel = { id: string; evalSetId: string; contenders: Contender[] };
type EvalCase = { id: string; input: PerLocale };
type Grader = { id: string; kind: string; rubric?: PerLocale; judgeRecipe?: string; labels?: { input: PerLocale; output: PerLocale }; expects?: "pass" | "expected-answer" };
type EvalSet = { id: string; cases: EvalCase[]; graders: Grader[] };
type Request = { id: string; locale: string; system: string; prompt: string };

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
