import { expect, test, type Page } from "@playwright/test";

// These tests exercise the curated path and are deterministic: the live-model route is answered as
// "unavailable" at the network level, so they never spend API credits even when a key is configured.
// Typing one of the example requests exactly still works without a model.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/paa/intent", (route) => route.fulfill({ status: 503, json: { error: "ai_unavailable" } }));
});

/** The interface has one control: say what you want. */
async function ask(page: Page, text: string) {
  await page.getByLabel("What would you like to see?").fill(text);
  await page.getByRole("button", { name: "Build" }).click();
}

/** Switching profile happens in the avatar menu. */
async function profile(page: Page, label: string) {
  await page.getByRole("button", { name: /Viewing as/ }).click();
  await page.getByRole("menuitemradio", { name: new RegExp(label) }).click();
}

/** Actions live behind the Help button, not in a permanent toolbar: the demo is about asking. */
async function helpAction(page: Page, name: RegExp) {
  await page.getByRole("button", { name: "Help" }).click();
  await page.getByRole("button", { name }).click();
}

async function open(page: Page, company: RegExp) {
  await page.goto("/paa");
  await page.getByRole("button", { name: company }).click();
}

const DOWNTIME = "Compare downtime this month with last month and show the biggest contributors.";
const DEFECT_TREND = "How has the defect rate changed over the last two years?";

test.describe("the interface is one control, not a chatbot with buttons", () => {
  test("an empty canvas has the intent field and nothing to click but Build, Help and the profile", async ({ page }) => {
    await open(page, /Northstar/);
    await expect(page.getByLabel("What would you like to see?")).toBeVisible();
    // No suggestion cards, no follow-up chips, no sidebar.
    await expect(page.getByRole("button", { name: /Compare downtime this month/ })).toHaveCount(0);
    await expect(page.getByText("Take it further")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Viewing as/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Help" })).toBeVisible();
  });

  test("Tab accepts the ghost example, and Enter builds it", async ({ page }) => {
    await open(page, /Northstar/);
    const field = page.getByLabel("What would you like to see?");
    await expect(field).toHaveAttribute("placeholder", /^Try: /);
    await field.focus();
    await page.keyboard.press("Tab");
    await expect(field).not.toHaveValue("");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 2 }).filter({ hasNotText: "Northstar" }).first()).toBeVisible();
  });

  test("free text explains when live AI is off", async ({ page }) => {
    await open(page, /Northstar/);
    await ask(page, "Show me something new");
    await expect(page.getByText(/Live AI isn.t configured/).first()).toBeVisible();
  });
});

test("Northstar downtime journey renders from service data and respects profile scope", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await open(page, /Northstar/);
  await ask(page, DOWNTIME);

  // The director sees the planted conveyor-failure anomaly, computed by the service.
  await expect(page.getByText(/The largest increase came from Conveyor failure/)).toBeVisible();
  await expect(page.getByRole("table")).toContainText("Conveyor failure");

  // The inspector separates recorded events from the model's stated reasons.
  await page.getByRole("button", { name: /how PAA built this/ }).click();
  await expect(page.getByText("Recorded events from the backend.")).toBeVisible();
  await expect(page.getByText("northstar.downtime_breakdown").first()).toBeVisible();

  // Switching profile re-runs the same plan under narrower policy, without the model.
  await profile(page, "Line Supervisor");
  await expect(page.getByText("Results are limited to the data this role is permitted to see.")).toBeVisible();
  await expect(page.getByText(/largest increase came from Conveyor failure/)).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("filters re-run the service directly and policy blocks what a profile may not see", async ({ page }) => {
  await open(page, /Northstar/);
  await ask(page, DEFECT_TREND);

  const narrative = page.getByText(/The defect rate moved from/);
  await expect(narrative).toBeVisible();
  const before = await narrative.textContent();

  await page.getByLabel("Factory").selectOption("gdansk");
  await expect(narrative).not.toHaveText(before ?? "");
  await expect(page.getByText("Results are limited")).toHaveCount(0);

  // The same Gdansk filter under a profile scoped to Dublin is denied, not silently shown.
  await profile(page, "Line Supervisor");
  await expect(page.getByText("This request could not be completed for the selected role.")).toBeVisible();
  await expect(page.getByText(/The defect rate moved from/)).toHaveCount(0);
});

test("a view can be taken further: PDF with download, slide deck preview and an email", async ({ page }) => {
  await open(page, /Northstar/);
  await ask(page, DOWNTIME);
  await expect(page.getByText(/The largest increase came from Conveyor failure/)).toBeVisible();

  // PDF: a real file the visitor can download.
  await helpAction(page, /Create a PDF report/);
  const download = page.getByRole("link", { name: "Download" });
  await expect(download).toBeVisible();
  await expect(download).toHaveAttribute("download", "downtime-this-month-against-last-month.pdf");
  await expect(page.getByText(/PDF report ·/)).toBeVisible();

  // Slides: a preview filmstrip of the real deck, plus a downloadable .pptx.
  await helpAction(page, /Create a slide deck/);
  await expect(page.getByRole("list", { name: "Slide previews" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download" })).toHaveAttribute("download", /\.pptx$/);

  // Email: a mail window with a send step.
  await helpAction(page, /Draft an email/);
  const email = page.getByRole("group", { name: "Email draft" });
  await expect(email).toBeVisible();
  await expect(email).toContainText("Leadership team");
  await expect(email.getByRole("img").first()).toBeVisible();
  await email.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Message sent")).toBeVisible();
  await expect(page.getByText(/nothing was sent and no email service was contacted/)).toBeVisible();

  // The inspector records the action as an executed, authorized event.
  await page.getByRole("button", { name: /how PAA built this/ }).click();
  await expect(page.getByText("northstar.action.draft_email").first()).toBeVisible();
});

test("actions are governed by profile: a supervisor can export a PDF but not a deck or email", async ({ page }) => {
  await open(page, /Northstar/);
  await ask(page, "Which production lines have the highest defect rates?");
  await profile(page, "Line Supervisor");
  await expect(page.getByText("Results are limited to the data this role is permitted to see.")).toBeVisible();

  await helpAction(page, /Create a slide deck/);
  await expect(page.getByText(/isn.t permitted to build slide decks/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Download" })).toHaveCount(0);

  await helpAction(page, /Create a PDF report/);
  await expect(page.getByRole("link", { name: "Download" })).toBeVisible();
  await expect(page.getByText(/isn.t permitted/)).toHaveCount(0);
});

test("the help panel keeps actions out of sight until wanted, and explains the company in About", async ({ page }) => {
  await open(page, /Northstar/);
  await page.getByRole("button", { name: "Help" }).click();
  const panel = page.getByRole("dialog", { name: "Help" });
  await expect(panel.getByRole("tab", { name: "Take it further" })).toHaveAttribute("aria-selected", "true");
  // Before any view exists the actions explain themselves rather than appearing as dead buttons.
  await expect(panel.getByText(/Build a view first/)).toBeVisible();

  await panel.getByRole("tab", { name: "About" }).click();
  await expect(panel.getByText("Dublin (Ireland), Gdansk (Poland), Monterrey (Mexico)")).toBeVisible();
  await expect(panel.getByText(/1 Oct 2022 to 30 Sep 2026 \(4 years\)/)).toBeVisible();
  await expect(panel.getByText("Weekly", { exact: true })).toBeVisible();
  await expect(panel.getByText("Quarterly", { exact: true })).toBeVisible();
  await expect(panel.getByText("You are here")).toBeVisible();
  await expect(panel.getByText("Data scope: Dublin Plant only")).toBeVisible();
  await expect(panel.getByText("Data scope: All 3 plants")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

test("four years of data are on offer", async ({ page }) => {
  await open(page, /Northstar/);
  await ask(page, "Show production by quarter for the whole four years.");
  await expect(page.getByText(/Across the whole period the plants produced/)).toBeVisible();
  const table = page.getByRole("table");
  await expect(table.getByRole("row")).toHaveCount(17); // header plus sixteen quarters
  await expect(table).toContainText("Q4 2022");
  await expect(table).toContainText("Q3 2026");
});

test.describe("Orbit: three profiles, three levels of access", () => {
  const MRR = "Show MRR growth over the last six months.";
  const CHURN = "Compare churn across subscription plans.";
  const BUGS = "Where are the bugs? Show bug tickets by feature for the last three months.";
  const RISK = "Which customer accounts are most at risk of leaving?";

  test("the CEO sees revenue; the same question is refused to the Head of Operations and the Junior Developer", async ({ page }) => {
    await open(page, /Orbit Software/);
    await ask(page, MRR);
    await expect(page.getByText(/MRR reached €/)).toBeVisible();
    await expect(page.getByText("Current MRR")).toBeVisible();

    await profile(page, "Head of Operations");
    await expect(page.getByText("This request could not be completed for the selected role.")).toBeVisible();
    await expect(page.getByText(/MRR reached/)).toHaveCount(0);

    await profile(page, "Junior Software Developer");
    await expect(page.getByText("This request could not be completed for the selected role.")).toBeVisible();

    // And back to the CEO, whose view comes back in full.
    await profile(page, "CEO");
    await expect(page.getByText(/MRR reached €/)).toBeVisible();
  });

  test("Head of Operations sees churn and named accounts, with revenue withheld rather than blocked", async ({ page }) => {
    await open(page, /Orbit Software/);
    await profile(page, "Head of Operations");
    await ask(page, CHURN);
    await expect(page.getByText(/has the highest monthly churn/)).toBeVisible();
    await expect(page.getByText("Results are limited to the data this role is permitted to see.")).toBeVisible();
    // The revenue column is a dash, never a number or a zero.
    const rows = page.getByRole("table").getByRole("row");
    await expect(rows.nth(1)).toContainText("–");
    await expect(rows.nth(1)).not.toContainText("€");

    await ask(page, RISK);
    await expect(page.getByText(/is the account most at risk/)).toBeVisible();
    await expect(page.getByRole("table")).toContainText("–");

    // The withholding is a recorded policy event, distinct from a denial.
    await page.getByRole("button", { name: /how PAA built this/ }).click();
    await expect(page.getByText(/Revenue figures \(account MRR\) are hidden for this role/)).toBeVisible();
  });

  test("the Junior Developer gets usage and support, but customer accounts and churn are refused", async ({ page }) => {
    await open(page, /Orbit Software/);
    await profile(page, "Junior Software Developer");
    await ask(page, BUGS);
    await expect(page.getByText(/Integrations accounts for the most bug tickets/)).toBeVisible();
    await expect(page.getByText("Results are limited")).toHaveCount(0);

    await ask(page, RISK);
    await expect(page.getByText("This request could not be completed for the selected role.")).toBeVisible();
    await ask(page, CHURN);
    await expect(page.getByText("This request could not be completed for the selected role.")).toBeVisible();
  });

  test("About describes the company and exactly what each profile may do", async ({ page }) => {
    await open(page, /Orbit Software/);
    await page.getByRole("button", { name: "Help" }).click();
    const panel = page.getByRole("dialog", { name: "Help" });
    await panel.getByRole("tab", { name: "About" }).click();
    await expect(panel.getByText(/fictional B2B software company/)).toBeVisible();
    await expect(panel.getByText("Monthly", { exact: true })).toBeVisible();
    await expect(panel.getByText("Revenue figures appear as a dash wherever they would otherwise be shown: hidden, not blocked.")).toBeVisible();
    await expect(panel.getByText("Product usage and support only")).toBeVisible();
    await expect(panel.getByText("You are here")).toBeVisible();
  });

  test("the company is isolated: switching companies clears everything", async ({ page }) => {
    await open(page, /Orbit Software/);
    await ask(page, MRR);
    await expect(page.getByText(/MRR reached €/)).toBeVisible();
    await page.getByRole("button", { name: /Back to all companies/ }).click();
    await page.getByRole("button", { name: /Northstar/ }).click();
    await expect(page.getByText(/MRR reached/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Viewing as/ })).toContainText("Operations Director");
  });
});

test.describe("Grove: privacy is enforced in the services, not the screen", () => {
  const HEADCOUNT = "Show headcount changes by department this year.";
  const FUNNEL = "Where are candidates dropping out of the hiring funnel?";
  const LEAVE = "How much leave is being taken, and of what kind?";
  const ENGAGEMENT = "How engaged are people, and what is driving it?";

  test("small groups are folded into Other, never shown on their own, and the screen says so", async ({ page }) => {
    await open(page, /Grove People/);
    await ask(page, HEADCOUNT);
    await expect(page.getByText(/Headcount moved from/)).toBeVisible();
    const table = page.getByRole("table");
    await expect(table).toContainText("Other (small groups)");
    // Legal has four people, so it can never appear by itself.
    await expect(table).not.toContainText("Legal");
    await expect(page.getByText("Results are limited to the data this role is permitted to see.")).toBeVisible();

    await page.getByRole("button", { name: /how PAA built this/ }).click();
    await expect(page.getByText(/Groups with fewer than five people are combined into/).first()).toBeVisible();
  });

  test("the Hiring Manager sees Engineering only, and leave and engagement are refused", async ({ page }) => {
    await open(page, /Grove People/);
    await profile(page, "Hiring Manager");
    await ask(page, HEADCOUNT);
    await expect(page.getByText("Results are limited to the data this role is permitted to see.")).toBeVisible();
    const table = page.getByRole("table");
    await expect(table).toContainText("Engineering");
    await expect(table).not.toContainText("Sales");

    await ask(page, LEAVE);
    await expect(page.getByText("This request could not be completed for the selected role.")).toBeVisible();
    await ask(page, ENGAGEMENT);
    await expect(page.getByText("This request could not be completed for the selected role.")).toBeVisible();
  });

  test("the Executive sees engagement but not leave, and the HR Business Partner sees both", async ({ page }) => {
    await open(page, /Grove People/);
    await profile(page, "Executive");
    await ask(page, ENGAGEMENT);
    await expect(page.getByText(/Overall engagement is/)).toBeVisible();
    await ask(page, LEAVE);
    await expect(page.getByText("This request could not be completed for the selected role.")).toBeVisible();

    await profile(page, "HR Business Partner");
    await expect(page.getByText(/days of leave were taken/)).toBeVisible();
  });

  test("the hiring funnel filters by department without calling the model", async ({ page }) => {
    await open(page, /Grove People/);
    await ask(page, FUNNEL);
    await expect(page.getByText(/The biggest loss is at/)).toBeVisible();
    const narrative = page.getByText(/Offers are accepted/);
    const before = await narrative.textContent();
    await page.getByLabel("Department").selectOption("engineering");
    await expect(narrative).not.toHaveText(before ?? "");
  });

  test("About states the privacy design, and that no profile can see individuals", async ({ page }) => {
    await open(page, /Grove People/);
    await page.getByRole("button", { name: "Help" }).click();
    const panel = page.getByRole("dialog", { name: "Help" });
    await panel.getByRole("tab", { name: "About" }).click();
    await expect(panel.getByText(/holds no individual employee records at all/)).toBeVisible();
    await expect(panel.getByText(/No figure describes fewer than 5 people/)).toBeVisible();
    await expect(panel.getByText("Engineering only")).toBeVisible();
    await expect(panel.getByText("See individual employee records (no profile can)").first()).toBeVisible();
  });
});

test("all three companies are available and start clean", async ({ page }) => {
  await page.goto("/paa");
  for (const name of [/Northstar/, /Orbit Software/, /Grove People/]) await expect(page.getByRole("button", { name })).toBeEnabled();
});
