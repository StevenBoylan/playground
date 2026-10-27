import { expect, test } from "@playwright/test";

// These tests exercise the curated path and are deterministic: the live-model route is answered as
// "unavailable" at the network level, so they never spend API credits even when a key is configured.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/paa/intent", (route) => route.fulfill({ status: 503, json: { error: "ai_unavailable" } }));
});

test("Northstar downtime journey renders from service data and respects role scope", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/paa");
  await page.getByRole("button", { name: /Northstar/ }).click();
  await page.getByRole("button", { name: /Compare downtime this month/ }).click();

  // Director sees the planted conveyor-failure anomaly, computed by the service.
  await expect(page.getByText(/The largest increase came from Conveyor failure/)).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Conveyor failure");

  // The inspector separates recorded events from the model's stated reasons.
  await page.getByRole("button", { name: /how PAA built this/ }).click();
  await expect(page.getByText("Recorded events from the backend.")).toBeVisible();
  await expect(page.getByText("northstar.downtime_breakdown").first()).toBeVisible();

  // Switching role re-runs the same plan under narrower policy, without the model.
  await page.getByRole("radio", { name: "Line Supervisor" }).click();
  await expect(page.getByText("Results are limited to the data this role is permitted to see.")).toBeVisible();
  await expect(page.getByText(/largest increase came from Conveyor failure/)).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("filters re-run the service directly and policy blocks what a role may not see", async ({ page }) => {
  await page.goto("/paa");
  await page.getByRole("button", { name: /Northstar/ }).click();
  await page.getByRole("button", { name: /How has the defect rate changed/ }).click();

  const narrative = page.getByText(/The defect rate moved from/);
  await expect(narrative).toBeVisible();
  const before = await narrative.textContent();

  await page.getByLabel("Factory").selectOption("gdansk");
  await expect(narrative).not.toHaveText(before ?? "");
  await expect(page.getByText("Results are limited")).toHaveCount(0);

  // The same Gdansk filter under a role scoped to Dublin is denied, not silently shown.
  await page.getByRole("radio", { name: "Line Supervisor" }).click();
  await expect(page.getByText("This request could not be completed for the selected role.")).toBeVisible();
  await expect(page.getByText(/The defect rate moved from/)).toHaveCount(0);
});

test("follow-up suggestions appear once a view exists, and free text explains when AI is off", async ({ page }) => {
  await page.goto("/paa");
  await page.getByRole("button", { name: /Northstar/ }).click();
  await page.getByRole("button", { name: /highest defect rates/ }).click();
  await expect(page.getByRole("button", { name: "Show that as a table" })).toBeVisible();

  await page.getByLabel("What would you like to see?").fill("Show me something new");
  await page.getByRole("button", { name: "Build" }).click();
  await expect(page.getByText(/Live AI isn.t configured/).first()).toBeVisible();
});

test("other companies are not yet selectable", async ({ page }) => {
  await page.goto("/paa");
  await expect(page.getByRole("button", { name: /Orbit Software/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Grove People/ })).toBeDisabled();
});
