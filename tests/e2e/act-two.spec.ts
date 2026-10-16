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
