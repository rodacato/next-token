import { expect, test } from "@playwright/test";

test.describe("chapter 1 · sorts", () => {
  test("breaks typed copy into sorts and measures the Spanish premium", { tag: "@smoke" }, async ({ page }) => {
    await page.goto("./?compositor=recorded");
    await expect(page.getByRole("heading", { name: "The bill went up in Spanish." })).toBeVisible();

    await page.getByTestId("copy").fill("Every morning the baker opens the door.");
    const stick = page.getByTestId("stick-o200k");
    await expect(stick.locator(".sort")).toHaveCount(8);
    await expect(stick).toContainText("8 sorts");

    await page.getByTestId("advance").click();
    await page.getByTestId("advance").click();

    const measure = page.getByTestId("measure");
    await expect(measure.getByTestId("run-measure")).toBeDisabled();
    await measure.getByLabel("Spanish").check();
    await measure.getByTestId("run-measure").click();
    await expect(measure.getByTestId("verdict")).toContainText("The stick agrees.");
    await expect(measure).toContainText("more a month in Spanish");

    await page.getByTestId("advance").click();
    await expect(page.getByRole("heading", { name: "The case was cut for English." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Language Model Tokenizers Introduce Unfairness Between Languages" })).toBeVisible();
  });

  test("never says Correct or Wrong", async ({ page }) => {
    await page.goto("./?compositor=recorded");
    await expect(page.locator("body")).not.toContainText(/correct!|wrong!/i);
  });
});

test.describe("capítulo 1 · tipos", () => {
  test.use({ locale: "es-MX" });

  test("habla español y compone en el componedor", async ({ page }) => {
    await page.goto("./?compositor=recorded");
    await expect(page.getByRole("heading", { name: "La cuenta subió en español." })).toBeVisible();
    await page.getByTestId("copy").fill("Mañana llegará tu pedido.");
    await expect(page.getByTestId("stick-o200k").locator(".sort").first()).toBeVisible();
    await expect(page.getByTestId("stick-o200k")).toContainText("tipos");
  });
});

test("the reset dialog distributes the type", async ({ page }) => {
  await page.goto("./?compositor=recorded");
  await page.getByTestId("advance").click();
  await expect(page.getByRole("button", { name: /At the bench/ })).toHaveAttribute("aria-current", "step");

  await page.getByRole("button", { name: "Distribute the type" }).first().click();
  await page.getByRole("button", { name: "Distribute it" }).click();
  await expect(page.getByRole("button", { name: /The job/ })).toHaveAttribute("aria-current", "step");
  expect(await page.evaluate(() => localStorage.getItem("next-token:v1"))).toContain('"chapters":{}');
});
