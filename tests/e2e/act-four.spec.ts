import { expect, test, type Page } from "@playwright/test";

async function open(page: Page, title: RegExp) {
  await page.goto("./?compositor=recorded");
  await page.getByRole("button", { name: title }).click();
}

async function advance(page: Page, times: number) {
  for (let i = 0; i < times; i++) await page.getByTestId("advance").click();
}

test.describe("chapter 18 · should it be AI?", () => {
  test("an LLM everywhere costs more than the plan that uses one where it fits", async ({ page }) => {
    await open(page, /^18 Should it be AI\?/);
    await advance(page, 1);
    await page.getByTestId("run-month").click();
    await expect(page.getByTestId("month-ledger")).toBeVisible();
    await advance(page, 1);
    await page.getByRole("radio", { name: "4", exact: true }).check();
    await page.getByTestId("plan-order-status-rules").check();
    await page.getByTestId("plan-return-eligibility-rules").check();
    await page.getByTestId("plan-product-copy-rules").check();
    await page.getByTestId("run-month").click();
    await expect(page.getByTestId("features-finding")).toContainText("You predicted 4; the cheapest plan uses 1.");
  });
});

test.describe("chapter 19 · designing for failure", () => {
  test("honest refusal cuts harm the most; streaming alone raises it", async ({ page }) => {
    await open(page, /^19 Designing for failure/);
    await advance(page, 1);
    await page.getByTestId("safeguard-refusal").check();
    await expect(page.getByTestId("reply-preview")).toContainText("I'm not sure");
    await page.getByTestId("run-conversations").click();
    await expect(page.getByTestId("failure-ledger")).toBeVisible();
    await advance(page, 1);
    await page.getByRole("radio", { name: "Stream the reply" }).check();
    await expect(page.getByTestId("failure-finding")).toContainText("The biggest cut alone: Let it say \"I don't know\", from 155 to 79. And streaming alone raises harm to 220");
  });
});

test.describe("chapter 20 · the bill", () => {
  test("everything on the strong model costs thousands; routing and caching bring it under budget", async ({ page }) => {
    await open(page, /^20 The bill/);
    await advance(page, 1);
    await expect(page.getByTestId("bill-month")).toContainText("$3,744 a month");
    await advance(page, 1);
    await page.getByRole("radio", { name: "$2,000 to $5,000" }).check();
    await expect(page.getByTestId("bill-finding")).toContainText("As you predicted: $3,744 a month.");
    await page.getByTestId("strong-share").fill("25");
    await page.getByTestId("caching").check();
    await expect(page.getByTestId("bill-target")).toContainText("84% less");
    await expect(page.getByTestId("advance")).toBeEnabled();
  });
});
