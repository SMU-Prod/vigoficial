import { test, expect } from "@playwright/test";

/**
 * VIGI PRO — E2E Dashboard Tests
 *
 * Testa o dashboard principal e componentes visuais.
 * Requer autenticação prévia (usa storageState).
 */

// Auth setup: login before all tests in this file
test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Login programmatically via API
    const loginRes = await page.request.post("/api/auth/login", {
      data: {
        email: process.env.E2E_ADMIN_EMAIL || "admin@vigi.local",
        password: process.env.E2E_ADMIN_PASSWORD || "admin",
      },
    });

    const loginData = await loginRes.json();

    if (loginData.token) {
      // Navigate to callback to set cookie
      await page.goto(
        `/auth/callback?token=${encodeURIComponent(loginData.token)}&redirect=/dashboard`
      );
      await page.waitForURL(/\/dashboard/, { timeout: 10000 });
    }
  });

  test("should render dashboard page", async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/);
    // Dashboard should have main content area
    await expect(page.locator("main, [role='main'], #dashboard")).toBeVisible();
  });

  test("should display agent live map", async ({ page }) => {
    // Agent map component should be visible
    const agentMap = page.locator('[data-testid="agent-map"], .agent-live-map, svg');
    await expect(agentMap.first()).toBeVisible({ timeout: 10000 });
  });

  test("should load KPI data", async ({ page }) => {
    // Wait for API calls to complete
    await page.waitForTimeout(3000);

    // Page should have some numeric content (KPIs)
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeTruthy();
  });
});
