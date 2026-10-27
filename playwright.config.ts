import { defineConfig } from "@playwright/test";

const GATED_PORT = 3100;
export const GATED_PASSWORD = "playwright-test-password";

export default defineConfig({
  projects: [
    // The app itself, with the password gate off (local development).
    { name: "app", testDir: "tests/e2e", use: { baseURL: "http://localhost:3000" } },
    // A production build with the password gate on, the way it will run when deployed.
    { name: "gated", testDir: "tests/e2e-gated", use: { baseURL: `http://localhost:${GATED_PORT}` } },
  ],
  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: `npm run build && npm run start -- -p ${GATED_PORT}`,
      url: `http://localhost:${GATED_PORT}/unlock`,
      reuseExistingServer: true,
      timeout: 300_000,
      // The gated server never talks to the model: the key is blanked so no test can spend credits.
      env: { DEMO_PASSWORD: GATED_PASSWORD, ANTHROPIC_API_KEY: "" },
    },
  ],
});
