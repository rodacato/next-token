// The README demo's steps, on recorded runs (a fresh visit never downloads the model).
const pause = (page, ms) => page.waitForTimeout(ms);

async function advance(page) {
  await page.getByTestId("advance").click();
  await pause(page, 1200);
}

async function open(page, title) {
  await page.getByRole("button", { name: title }).click();
  await pause(page, 1800);
}

export default async function tour(page) {
  await pause(page, 2500);
  const copy = page.getByTestId("copy");
  await copy.fill("");
  await copy.pressSequentially("Every morning the baker opens the door.", { delay: 70 });
  await pause(page, 2500);
  await copy.fill("");
  await copy.pressSequentially("Cada mañana el panadero abre la puerta.", { delay: 70 });
  await pause(page, 3000);

  await open(page, /The next sort/);
  await page.getByTestId("fan").waitFor();
  await pause(page, 1500);
  await page.getByTestId("temperature").fill("0");
  await pause(page, 2000);
  await page.getByTestId("temperature").fill("1.6");
  await pause(page, 2500);
  await page.getByTestId("fan").locator('.blade[data-rank="0"]').click();
  await pause(page, 2500);

  await open(page, /The prompt as a specification/);
  await advance(page);
  await advance(page);
  await page.getByRole("radio", { name: "Prompt B" }).check();
  await pause(page, 800);
  await page.getByTestId("run-eval").click();
  await page.getByTestId("duel-verdict").waitFor();
  await page.getByTestId("duel-verdict").scrollIntoViewIfNeeded();
  await pause(page, 4000);

  await open(page, /^21 The launch/);
  await advance(page);
  await page.getByTestId("run-launch").click();
  await page.getByTestId("week-chart").waitFor();
  await page.getByTestId("week-chart").scrollIntoViewIfNeeded();
  await pause(page, 4500);
}
