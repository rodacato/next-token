import { expect, test } from "@playwright/test";

test.describe("the first-run walkthrough", () => {
  test("shows on first open, walks three steps, and stays gone after a reload", async ({ page }) => {
    await page.goto("./?compositor=recorded");
    const guide = page.getByTestId("walkthrough");
    await expect(guide).toContainText("1 of 3");
    await expect(page.getByTestId("walkthrough-next")).toBeFocused();
    await page.getByTestId("walkthrough-next").click();
    await expect(guide).toContainText("Work at the bench");
    await page.getByRole("button", { name: "Back" }).click();
    await expect(guide).toContainText("Start with the job");
    await page.getByTestId("walkthrough-next").click();
    await page.getByTestId("walkthrough-next").click();
    await page.getByTestId("walkthrough-next").click();
    await expect(guide).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId("advance")).toBeVisible();
    await expect(guide).toHaveCount(0);
  });

  test("Guide replays it, Esc closes it, and a reset doesn't bring it back", async ({ page }) => {
    await page.goto("./?compositor=recorded");
    await page.getByTestId("walkthrough-skip").click();
    await page.getByTestId("guide").click();
    await expect(page.getByTestId("walkthrough")).toContainText("1 of 3");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("walkthrough")).toHaveCount(0);

    await page.getByRole("button", { name: "Distribute the type" }).first().click();
    await page.getByRole("button", { name: "Distribute it" }).click();
    await page.reload();
    await expect(page.getByTestId("advance")).toBeVisible();
    await expect(page.getByTestId("walkthrough")).toHaveCount(0);
  });

  test("walkthrough=off hides it for a host, and Guide still works", async ({ page }) => {
    await page.goto("./?compositor=recorded&walkthrough=off");
    await expect(page.getByTestId("advance")).toBeVisible();
    await expect(page.getByTestId("walkthrough")).toHaveCount(0);
    await page.getByTestId("guide").click();
    await expect(page.getByTestId("walkthrough")).toContainText("Start with the job");
  });

  test("on a phone, the note stays on screen at every step", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("./?compositor=recorded");
    for (let step = 0; step < 3; step++) {
      const box = await page.getByRole("dialog").boundingBox();
      if (!box) throw new Error("The walkthrough note isn't on the page.");
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      expect(box.y + box.height).toBeLessThanOrEqual(800);
      await page.getByTestId("walkthrough-next").click();
    }
  });
});
