import { expect, test, type Page } from "@playwright/test";

async function open(page: Page, title: RegExp) {
  await page.goto("./?compositor=recorded");
  await page.getByRole("button", { name: title }).click();
}

async function advance(page: Page, times: number) {
  for (let i = 0; i < times; i++) await page.getByTestId("advance").click();
}

test.describe("chapter 5 · the prompt as a specification", () => {
  test("runs the duel on recorded runs after a prediction", async ({ page }) => {
    await open(page, /The prompt as a specification/);
    await advance(page, 2);
    await expect(page.getByTestId("run-eval")).toBeDisabled();
    await page.getByRole("radio", { name: "Prompt B" }).check();
    await page.getByTestId("run-eval").click();
    await expect(page.getByTestId("duel-score")).toBeVisible();
    await expect(page.getByTestId("duel-verdict")).toContainText("Lovely prompt. Your eval says it's worse.");
    await expect(page.getByTestId("result-galley")).toContainText("Recorded run · claude-haiku-5-5");
    await expect(page.getByTestId("result-galley")).toContainText("read directly");
  });

  test("keeps the prompts read-only without a live model", async ({ page }) => {
    await open(page, /The prompt as a specification/);
    await advance(page, 1);
    await expect(page.getByTestId("ticket-A").locator(".cm-content").first()).toHaveAttribute("contenteditable", "false");
  });
});

test.describe("chapter 6 · evals", () => {
  test("says it is guessing with no cases, then runs a chosen eval with the judge", async ({ page }) => {
    await open(page, /Evals/);
    await advance(page, 1);
    await expect(page.getByText("No test cases. You are guessing.")).toBeVisible();
    await expect(page.getByTestId("advance")).toBeDisabled();
    for (const id of ["stoneware-350", "porcelain-250", "bamboo-320"]) await page.getByTestId(`case-${id}`).locator("input").check();
    await page.getByTestId("grader-judge").locator("input").check();
    await advance(page, 1);
    await page.getByRole("radio", { name: "Prompt A" }).check();
    await page.getByTestId("run-eval").click();
    await expect(page.getByTestId("result-galley")).toBeVisible();
    await expect(page.getByTestId("judge-agreement")).toBeVisible();
  });
});

test.describe("capítulos 5 y 6", () => {
  test.use({ locale: "es-MX" });

  test("el duelo corre en español", async ({ page }) => {
    await open(page, /El prompt como especificación/);
    await advance(page, 2);
    await page.getByRole("radio", { name: "Prompt A" }).check();
    await page.getByTestId("run-eval").click();
    await expect(page.getByTestId("duel-verdict")).toContainText("Tu evaluación dice que es peor.");
    await expect(page.getByTestId("result-galley")).toContainText("Corrida grabada");
  });
});

test("outside work starts on recorded runs and warns before a key is used", async ({ page }) => {
  await open(page, /The prompt as a specification/);
  const panel = page.getByTestId("outside-work");
  await expect(panel).toContainText("Recorded runs (no key, no cost)");
  await panel.locator("summary").click();
  await panel.getByLabel("Anthropic, your key").check();
  await expect(panel).toContainText("Your key stays on this device");
  expect(await page.evaluate(() => localStorage.getItem("next-token:llm"))).toBeNull();
});

test.describe("chapter 7 · structured output", () => {
  test("the press rejects fenced sheets, retries them, and the schema avoids the retries", async ({ page }) => {
    await open(page, /Structured output/);
    await advance(page, 1);
    await page.getByTestId("feed-press").click();
    const stack = page.getByTestId("sheet-stack");
    await expect(stack.locator(".press-sheet__stamp", { hasText: "rejected" }).first()).toBeVisible();
    await expect(stack).toContainText("wrapped in a Markdown code fence");
    await expect(stack).toContainText("Sent back once with the press's reason");
    await advance(page, 1);
    await page.getByTestId("predict-accepted").fill("5");
    await page.getByTestId("feed-press").click();
    await expect(stack.locator(".press-sheet")).not.toHaveCount(0);
    await page.getByLabel("Constrained by schema").check();
    await page.getByTestId("feed-press").click();
    const tally = page.getByTestId("press-tally");
    await expect(tally).toContainText("Constrained by schema");
    await expect(tally.locator("tr").nth(2)).toContainText("6 of 6");
  });
});

test.describe("chapter 8 · tools", () => {
  test("the learner runs the tools; the wrong row is noticed and the refund can be refused", async ({ page }) => {
    await open(page, /^8 Tools/);
    await advance(page, 1);
    await page.getByTestId("start-docket").click();
    await expect(page.getByTestId("docket")).toContainText('lookup_order({"orderId":"50211"})');
    await page.getByTestId("result-right-row").click();
    await expect(page.getByTestId("docket")).toContainText("issue_refund");
    await page.getByTestId("result-refuse").click();
    await expect(page.getByTestId("docket")).toContainText("supervisor");
    await expect(page.getByTestId("hand-back")).toHaveCount(0);
    await advance(page, 1);
    await page.getByRole("radio", { name: /Refund the coffee order/ }).check();
    await page.getByTestId("start-docket").click();
    await page.getByTestId("result-wrong-row").click();
    await page.getByTestId("result-not-found").click();
    await expect(page.getByTestId("tools-finding")).toContainText("Not what you predicted: the model noticed the mismatch and looked the order up again.");
    await expect(page.getByTestId("advance")).toBeEnabled();
  });
});

test.describe("chapter 9 · retrieval", () => {
  test("blind cuts lose the electronics rule; the grid shows which cut answers all three", async ({ page }) => {
    await open(page, /^9 Retrieval/);
    await advance(page, 1);
    await expect(page.getByTestId("embedder-source")).toContainText("Recorded vectors · multilingual-e5-small");
    await page.getByRole("radio", { name: /headphones 20 days ago/ }).check();
    await page.getByRole("radio", { name: "Every 160 characters" }).check();
    await page.getByTestId("ask").click();
    await expect(page.getByTestId("rag-answer")).toContainText("contradicts the handbook");
    await page.getByRole("radio", { name: "Section by section" }).check();
    await page.getByTestId("ask").click();
    await expect(page.getByTestId("rag-answer")).toContainText("matches the handbook");
    await advance(page, 1);
    await page.getByRole("radio", { name: "Section by section" }).last().check();
    await page.getByTestId("run-grid").click();
    await expect(page.getByTestId("rag-finding")).toContainText("As you predicted. All three right: Section by section.");
  });
});

test.describe("chapter 10 · agents", () => {
  test("the night pays twice without notes; a person and notes make it pay once", async ({ page }) => {
    await open(page, /^10 Agents/);
    await advance(page, 1);
    await expect(page.getByTestId("harness-diagram")).toContainText("MCP server");
    await page.getByTestId("run-night").click();
    await expect(page.getByTestId("till")).toContainText("4,900 MXN. Refunds run: 2.");
    await advance(page, 1);
    await page.getByRole("radio", { name: "4,900 MXN" }).check();
    await page.getByTestId("run-night").click();
    await expect(page.getByTestId("agents-baseline")).toContainText("As you predicted: 4,900 MXN.");
    await page.getByRole("radio", { name: "Ask a person" }).check();
    await page.getByTestId("toggle-memory").check();
    await page.getByTestId("run-night").click();
    await page.getByTestId("approve").click();
    await expect(page.getByTestId("till")).toContainText("2,450 MXN. Refunds run: 1.");
    await expect(page.getByTestId("agents-fixed")).toContainText("One refund, 2,450 MXN.");
    await expect(page.getByTestId("advance")).toBeEnabled();
  });
});
