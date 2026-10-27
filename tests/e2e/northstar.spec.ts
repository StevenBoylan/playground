import { expect, test } from "@playwright/test";

test("Northstar downtime journey renders from service data and respects role scope", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/paa");
  await page.getByRole("button", { name: /Northstar/ }).click();
  await page.getByRole("button", { name: /Compare downtime this month/ }).click();

  // Director sees the planted conveyor-failure anomaly, computed by the service.
  await expect(page.getByText(/The largest increase came from Conveyor failure/)).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Conveyor failure");

  // The inspector shows recorded execution events.
  await page.getByRole("button", { name: /how PAA built this/ }).click();
  await expect(page.locator("pre")).toContainText("northstar.downtime_breakdown");

  // Switching role re-runs the same request under narrower policy.
  await page.getByLabel("View as").selectOption("line_supervisor");
  await expect(page.getByText("Results are limited to the data this role is permitted to see.")).toBeVisible();
  await expect(page.getByText(/largest increase came from Conveyor failure/)).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("other companies are not yet selectable", async ({ page }) => {
  await page.goto("/paa");
  await expect(page.getByRole("button", { name: /Orbit Software/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Grove People/ })).toBeDisabled();
});
