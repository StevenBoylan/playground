import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "playwright-test-password";

async function unlock(page: Page, password: string) {
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Unlock" }).click();
}

const RUN = { organizationId: "northstar", roleId: "operations_director", promptId: "downtime-comparison" };

test.describe("the demo is private", () => {
  test("a visitor without the password is sent to the unlock screen", async ({ page }) => {
    await page.goto("/paa");
    await expect(page).toHaveURL(/\/unlock\?next=%2Fpaa/);
    await expect(page.getByRole("heading", { name: "This demo is private" })).toBeVisible();
    // Nothing of the demo itself is rendered.
    await expect(page.getByText("Choose a fictional company")).toHaveCount(0);
  });

  test("a wrong password is refused, and the visitor stays locked out", async ({ page }) => {
    await page.goto("/unlock");
    await unlock(page, "not the password");
    await expect(page.getByText("Incorrect password")).toBeVisible();
    await expect(page).toHaveURL(/\/unlock/);
    await page.goto("/paa");
    await expect(page).toHaveURL(/\/unlock/);
  });

  test("the right password unlocks the demo, and the API works afterwards", async ({ page }) => {
    await page.goto("/paa");
    await unlock(page, PASSWORD);
    await expect(page).toHaveURL(/\/paa$/);
    await expect(page.getByText("Choose a fictional company")).toBeVisible();

    const res = await page.request.post("/api/paa/run", { data: RUN });
    expect(res.status()).toBe(200);
    const cookies = await page.context().cookies();
    const cookie = cookies.find((c) => c.name === "paa_access");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
  });

  test("the API cannot be called directly to spend credits: every route refuses without the cookie", async ({ request }) => {
    for (const path of ["/api/paa/intent", "/api/paa/run", "/api/paa/rerun", "/api/paa/export"]) {
      const res = await request.post(path, { data: RUN });
      expect(res.status(), path).toBe(401);
      expect(await res.json()).toEqual({ error: "locked" });
    }
  });

  test("a forged cookie does not work", async ({ browser }) => {
    const context = await browser.newContext();
    await context.addCookies([{ name: "paa_access", value: `${Date.now() + 99_999_999}.${"a".repeat(64)}`, url: "http://localhost:3100" }]);
    const res = await context.request.post("/api/paa/run", { data: RUN, failOnStatusCode: false });
    expect(res.status()).toBe(401);
    await context.close();
  });

  test("the unlock link cannot be used to send someone to another site", async ({ page }) => {
    await page.goto("/unlock?next=https%3A%2F%2Fevil.example%2F");
    await unlock(page, PASSWORD);
    await expect(page).toHaveURL(/localhost:3100\/paa$/);
  });

  test("guessing is slowed down", async ({ browser }) => {
    test.setTimeout(60_000);
    // Its own network identity, so these attempts cannot affect the other tests' allowance.
    const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": "198.51.100.7" } });
    const page = await context.newPage();
    await page.goto("/unlock");
    for (let i = 0; i < 9; i++) {
      await page.getByLabel("Password").fill(`guess-${i}`);
      const response = page.waitForResponse("**/api/access");
      await page.getByRole("button", { name: "Unlock" }).click();
      await response;
    }
    await expect(page.getByText(/Too many attempts/)).toBeVisible();
    await context.close();
  });

  test("search engines are told to stay away", async ({ page, request }) => {
    const robots = await request.get("/robots.txt");
    expect(await robots.text()).toMatch(/Disallow: \//);
    await page.goto("/unlock");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});
