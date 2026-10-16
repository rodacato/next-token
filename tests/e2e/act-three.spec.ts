import { expect, test, type Page } from "@playwright/test";

async function open(page: Page, title: RegExp) {
  await page.goto("./?compositor=recorded");
  await page.getByRole("button", { name: title }).click();
}

async function advance(page: Page, times: number) {
  for (let i = 0; i < times; i++) await page.getByTestId("advance").click();
}

test.describe("chapter 11 · casting from scratch", () => {
  test("the recorded run overfits: held-out loss turns up and the late samples are copies", async ({ page }) => {
    await open(page, /^11 Casting from scratch/);
    await advance(page, 1);
    await expect(page.getByTestId("trainer-source")).toBeVisible();
    await page.getByTestId("cast").click();
    await expect(page.getByTestId("stop-2000")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("stop-250")).toContainText("0 of 12 copied");
    await expect(page.getByTestId("loss-chart")).toContainText("held-out lowest at 250");
    await advance(page, 1);
    await page.getByTestId("predict-copied").fill("3");
    await page.getByTestId("cast").click();
    await expect(page.getByTestId("trainer-finding")).toContainText("You predicted 3; 7 of 12 were copied.", { timeout: 20_000 });
  });
});

test.describe("chapter 12 · the stages of a real model", () => {
  test("sorting blind, then the checks: the release is not the best everywhere", async ({ page }) => {
    await open(page, /^12 The stages of a real model/);
    await advance(page, 1);
    await page.getByRole("radio", { name: "A capital" }).check();
    const slips = page.getByTestId("blind-sort").locator("li");
    await expect(slips).toHaveCount(4);
    for (let i = 0; i < 4; i++) await slips.nth(i).getByRole("radio", { name: "Release" }).check();
    await page.getByTestId("reveal").click();
    await expect(page.getByTestId("sort-score")).toContainText("You placed 1 of 4.");
    await advance(page, 1);
    await page.getByRole("radio", { name: "Release" }).last().check();
    await expect(page.getByTestId("stages-finding")).toContainText("Most checks passed: Midtrain, SFT, with 7 of 8.");
  });
});

test.describe("chapter 15 · the LoRA plate", () => {
  test("the arithmetic uses MiniCPM5-2B's shapes; the adapter changes output without touching the base", async ({ page }) => {
    await open(page, /^15 The LoRA plate/);
    await advance(page, 1);
    await expect(page.getByTestId("lora-count")).toContainText("Trainable: 8.6 M of 2,516.8 M parameters (0.34%).");
    await page.getByTestId("train-adapter").click();
    await expect(page.getByTestId("fingerprint")).toContainText("Not one base weight changed.");
    await expect(page.getByTestId("adapter-samples")).toContainText("MXN");
    await page.getByTestId("adapter-off").check();
    await expect(page.getByTestId("adapter-samples")).not.toContainText("MXN");
    await advance(page, 1);
    await page.getByRole("radio", { name: "rank 16" }).last().check();
    await page.getByTestId("all-ranks").click();
    await expect(page.getByTestId("rank-table")).toBeVisible();
    await expect(page.getByTestId("lora-finding")).toBeVisible();
  });
});

test.describe("chapter 14 · the data workshop", () => {
  test("mechanical checks find copies and leaks; the judge finds contradictions and raises false alarms", async ({ page }) => {
    await open(page, /^14 The data workshop/);
    await advance(page, 1);
    await page.getByTestId("flag-en-25").selectOption("contradiction");
    await advance(page, 1);
    await page.getByTestId("predict-mechanical").fill("10");
    await page.getByTestId("run-checks").click();
    await expect(page.getByTestId("workshop-finding")).toContainText("You predicted 10; the mechanical checks caught 6 of 10.");
    await page.getByTestId("run-judge").click();
    await expect(page.getByTestId("workshop-finding")).toContainText("The judge caught 4 of 10. Good rows it flagged anyway, for a person to look at: 1.");
  });
});

test.describe("chapter 13 · kinds of training", () => {
  test("the ledger hides what each method can't do; the jobs are checked against it", async ({ page }) => {
    await open(page, /^13 Kinds of training/);
    await advance(page, 1);
    await expect(page.getByTestId("pipeline")).toContainText("Distillation");
    await advance(page, 1);
    const answers: Record<string, string> = { "legal-spanish": "continued", "house-format": "sft", pairs: "dpo", invoices: "rlvr", cheaper: "distillation", "from-nothing": "pretraining", rankings: "dpo" };
    for (const [job, method] of Object.entries(answers)) await page.getByTestId(`job-${job}`).selectOption(method);
    await page.getByTestId("check-jobs").click();
    await expect(page.getByTestId("ledger-finding")).toContainText("6 of 7 match the ledger.");
  });
});

test.describe("chapter 16 · train or not", () => {
  test("the fine-tune's evidence: behaviour learned, facts not; then six calls", async ({ page }) => {
    await open(page, /^16 Train or not\?/);
    await advance(page, 1);
    await expect(page.getByTestId("behaviour-after")).toHaveText("10");
    await expect(page.getByTestId("facts-after")).toHaveText("1");
    await advance(page, 1);
    const calls: Record<string, string> = { "sign-off": "prompt", prices: "rag", "policy-facts": "fine-tune", router: "distill", voice: "fine-tune", manual: "rag" };
    for (const [id, option] of Object.entries(calls)) await page.getByTestId(`decide-${id}-${option}`).check();
    await page.getByTestId("check-decisions").click();
    await expect(page.getByTestId("decision-finding")).toContainText("5 of 6 match.");
  });
});

test.describe("chapter 17 · before and after", () => {
  test("the Act II runner on both models shows what the fine-tune broke", async ({ page }) => {
    await open(page, /^17 Before and after/);
    await advance(page, 1);
    await expect(page.getByTestId("training-sheet")).toContainText("0.19%");
    await page.getByTestId("run-before-after").click();
    await expect(page.getByTestId("result-galley")).toHaveCount(1);
    await advance(page, 1);
    await page.getByTestId("predict-worse").fill("0");
    await page.getByTestId("run-general").click();
    await expect(page.getByTestId("result-galley")).toHaveCount(2);
    await expect(page.getByTestId("before-after-finding")).toContainText("You predicted 0; 2 of 8 general checks got worse.");
    await expect(page.getByTestId("worse-list")).toContainText("Melbourne");
  });
});
