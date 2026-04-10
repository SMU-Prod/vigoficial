import { defineConfig, devices } from "@playwright/test";

/**
 * VIGI PRO — Playwright E2E Test Configuration
 *
 * Run: npx playwright test
 * UI:  npx playwright test --ui
 * CI:  npx playwright test --reporter=github
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/results",

  /* Timeout per test */
  timeout: 30_000,

  /* Retry on CI */
  retries: process.env.CI ? 2 : 0,

  /* Parallel in CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter */
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "e2e/report" }]]
    : [["html", { open: "on-failure", outputFolder: "e2e/report" }]],

  use: {
    /* Base URL — dev server */
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",

    /* Collect trace on failure */
    trace: "on-first-retry",

    /* Screenshot on failure */
    screenshot: "only-on-failure",

    /* Video on failure */
    video: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  /* Start dev server before tests (local only) */
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
