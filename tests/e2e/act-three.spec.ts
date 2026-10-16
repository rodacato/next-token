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
