import { expect, test, type Page } from "@playwright/test";

async function open(page: Page, title: RegExp) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("./?compositor=recorded");
  await page.getByRole("button", { name: title }).click();
}

async function advance(page: Page, times: number) {
  for (let i = 0; i < times; i++) await page.getByTestId("advance").click();
}

test.describe("chapter 3 · the composing stick", () => {
  test("drops the system rule when the stick overflows, and keeps it when clamped", async ({ page }) => {
    await open(page, /The composing stick/);
    await advance(page, 1);
    await page.getByTestId("all-messages").click();
    await expect(page.getByTestId("fallen")).toContainText("The stick is full. Something falls off the end.");
    await expect(page.getByTestId("fact-refund-rule")).toContainText("fell off");
    await expect(page.getByTestId("stick-verdict")).toContainText("Refunds over $2,000 need a supervisor");

    await page.getByLabel("Clamp the system message", { exact: true }).check();
    await expect(page.getByTestId("fact-refund-rule")).toContainText("still on the stick");
  });

  test("measures lost-in-the-middle after a prediction, from a labeled recording", async ({ page }) => {
    await open(page, /The composing stick/);
    await advance(page, 1);
    await page.getByTestId("all-messages").click();
    await advance(page, 1);
    await expect(page.getByTestId("run-measure")).toBeDisabled();
    await page.getByLabel("In the middle").check();
    await page.getByTestId("run-measure").click();
    await expect(page.getByTestId("needle-chart").locator("rect")).toHaveCount(18);
    await expect(page.getByTestId("needle-finding")).toContainText("You predicted: In the middle.");
    await expect(page.getByTestId("needle-chart")).toContainText(/Recorded run · Qwen2\.5-0\.5B/);
  });
});

test.describe("chapter 4 · fluent is not true", () => {
  test("writes references, asks for marks first, then checks the catalog", async ({ page }) => {
    await open(page, /Fluent is not true/);
    await advance(page, 1);
    await page.getByTestId("write").click();
    const references = page.getByTestId("references").locator("li");
    await expect(references.first()).toBeVisible();
    await expect(page.getByTestId("advance")).toBeDisabled();
    const count = await references.count();
    for (let i = 0; i < count; i++) await references.nth(i).getByLabel("Invented").check();
    await advance(page, 1);
    await page.getByTestId("check-catalog").click();
    await expect(page.getByTestId("fabrication-summary")).toContainText(`of ${count} references are not in the catalog`);
    await expect(page.getByTestId("verdict-0")).toBeVisible();
  });
});

test.describe("capítulos 3 y 4", () => {
  test.use({ locale: "es-MX" });

  test("el componedor se llena en español", async ({ page }) => {
    await open(page, /El componedor/);
    await advance(page, 1);
    await page.getByTestId("all-messages").click();
    await expect(page.getByTestId("fallen")).toContainText("Algo se cae por la punta.");
  });

  test("las referencias se revisan en español", async ({ page }) => {
    await open(page, /Fluido no es verdadero/);
    await advance(page, 1);
    await page.getByTestId("write").click();
    await expect(page.getByTestId("references").locator("li").first()).toBeVisible();
    await expect(page.getByTestId("ink-galley")).toContainText("Corrida grabada");
  });
});

test("the press sound is off by default and can be switched on", async ({ page }) => {
  await page.goto("./?compositor=recorded");
  const toggle = page.getByTestId("sound-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});
