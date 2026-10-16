// Drives Next Token inside Dojo's reference host so the conformance suite sees progress and complete.
export default async function drive(page) {
  const frame = page.frameLocator("#scroll-frame");
  await frame.getByTestId("copy").fill("Every morning the baker opens the door.");
  await frame.getByTestId("advance").click();
  await frame.getByTestId("advance").click();
  await frame.locator('input[value="spanish"]').check();
  await frame.getByTestId("run-measure").click();
  await frame.getByTestId("verdict").waitFor();
  await frame.getByTestId("advance").click();
  await page.waitForTimeout(500);
}
