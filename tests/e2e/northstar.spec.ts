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

test("a view can be taken further: PDF with download, slide deck preview and a simulated email", async ({ page }) => {
  await page.goto("/paa");
  await page.getByRole("button", { name: /Northstar/ }).click();
  await page.getByRole("button", { name: /Compare downtime this month/ }).click();
  await expect(page.getByText(/The largest increase came from Conveyor failure/)).toBeVisible();

  // PDF: a real file the visitor can download.
  await page.getByRole("button", { name: "Export PDF" }).click();
  const download = page.getByRole("link", { name: "Download" });
  await expect(download).toBeVisible();
  await expect(download).toHaveAttribute("download", "downtime-this-month-against-last-month.pdf");
  await expect(page.getByText(/PDF report ·/)).toBeVisible();

  // Slides: a preview filmstrip of the real deck, plus a downloadable .pptx.
  await page.getByRole("button", { name: "Slide deck" }).click();
  await expect(page.getByRole("list", { name: "Slide previews" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download" })).toHaveAttribute("download", /\.pptx$/);

  // Email: a simulated window that never sends.
  await page.getByRole("button", { name: "Draft email" }).click();
  const email = page.getByRole("group", { name: "Simulated email draft" });
  await expect(email).toBeVisible();
  await expect(email).toContainText("Leadership team");
  await expect(email.getByRole("img").first()).toBeVisible();
  await email.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Message sent (simulated)")).toBeVisible();
  await expect(page.getByText(/nothing was sent and no email service was contacted/)).toBeVisible();

  // The inspector records the action as an executed, authorized event.
  await page.getByRole("button", { name: /how PAA built this/ }).click();
  await expect(page.getByText("northstar.action.draft_email").first()).toBeVisible();
});

test("actions are governed by role: a supervisor can export a PDF but not a deck or email", async ({ page }) => {
  await page.goto("/paa");
  await page.getByRole("button", { name: /Northstar/ }).click();
  await page.getByRole("button", { name: /highest defect rates/ }).click();
  await page.getByRole("radio", { name: "Line Supervisor" }).click();
  await expect(page.getByText("Results are limited to the data this role is permitted to see.")).toBeVisible();

  await page.getByRole("button", { name: "Slide deck" }).click();
  await expect(page.getByText(/isn.t permitted to build slide decks/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Download" })).toHaveCount(0);

  await page.getByRole("button", { name: "Export PDF" }).click();
  await expect(page.getByRole("link", { name: "Download" })).toBeVisible();
  await expect(page.getByText(/isn.t permitted/)).toHaveCount(0);
});

test("other companies are not yet selectable", async ({ page }) => {
  await page.goto("/paa");
  await expect(page.getByRole("button", { name: /Orbit Software/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Grove People/ })).toBeDisabled();
});
