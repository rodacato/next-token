import { expect, test, type Page } from "@playwright/test";

async function openChapterTwo(page: Page, title: RegExp) {
  await page.goto("./?compositor=recorded&walkthrough=off");
  await page.getByRole("button", { name: title }).click();
  await expect(page.getByTestId("fan")).toBeVisible();
}

test.describe("chapter 2 · the next sort", () => {
  test("opens and closes the fan with temperature, from a labeled recorded run", async ({ page }) => {
    await openChapterTwo(page, /The next sort/);
    await expect(page.getByTestId("run-source")).toContainText(/Recorded run · Qwen2\.5-0\.5B · \d{4}-\d{2}-\d{2}/);

    const blades = page.getByTestId("fan").locator(".blade");
    await expect(blades).toHaveCount(8);

    await page.getByTestId("temperature").fill("0");
    await expect(page.getByText("Zero. The compositor takes the likeliest sort every time.")).toBeVisible();
    await page.getByTestId("temperature").fill("1.6");
    await expect(page.getByText(/Scalding|Hot\./)).toBeVisible();
  });

  test("sets a sort picked by hand and stamps it on the proof", async ({ page }) => {
    await openChapterTwo(page, /The next sort/);
    const first = page.getByTestId("fan").locator(".blade[data-rank=\"0\"]");
    const word = (await first.getAttribute("aria-label"))?.split(" ")[0] ?? "";
    await first.click();
    await expect(page.getByTestId("impression")).toContainText(word);
    await expect(page.getByTestId("copy")).toHaveValue(new RegExp(`${word}$`));
  });

  test("measures twenty draws cold and hot after a prediction", async ({ page }) => {
    await openChapterTwo(page, /The next sort/);
    await page.getByTestId("advance").click();
    await page.getByTestId("advance").click();
    await expect(page.getByTestId("run-measure")).toBeDisabled();
    await page.getByTestId("predict-cold").fill("1");
    await page.getByTestId("predict-hot").fill("6");
    await page.getByTestId("run-measure").click();
    await expect(page.getByTestId("tally-cold")).toContainText("distinct");
    await expect(page.getByTestId("tally-hot")).toContainText("you predicted 6");
  });
});

test.describe("capítulo 2 · el siguiente tipo", () => {
  test.use({ locale: "es-MX" });

  test("abre el abanico con una corrida grabada en español", async ({ page }) => {
    await openChapterTwo(page, /El siguiente tipo/);
    await expect(page.getByTestId("copy")).toHaveValue("Cada mañana el panadero abre la");
    await expect(page.getByTestId("run-source")).toContainText("Corrida grabada");
    await expect(page.getByTestId("fan").locator(".blade")).toHaveCount(8);
  });
});
