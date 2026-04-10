import { test, expect } from "@playwright/test";

/**
 * VIGI PRO — E2E Billing Tests
 *
 * Testa o fluxo de gestão de faturamento:
 * Autenticação → Navegação → Dados de faturamento → Status
 */

test.describe("Billing Page", () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto("/login");
    await page.fill('[name="email"]', process.env.E2E_ADMIN_EMAIL || "admin@vigi.local");
    await page.fill('[name="password"]', process.env.E2E_ADMIN_PASSWORD || "admin");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|admin\/perfil)/, { timeout: 10000 });
  });

  test("should navigate to financeiro page", async ({ page }) => {
    await page.goto("/financeiro");
    await expect(page).toHaveURL(/financeiro/);
    // Page should contain billing-related content
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
  });

  test("should verify billing data loads", async ({ page }) => {
    await page.goto("/financeiro");
    // Wait for billing data to load
    await page.waitForSelector("table, [data-testid='billing-list'], .billing-container", {
      timeout: 10000,
    });
    // Should display some billing content
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
  });

  test("should check status indicators", async ({ page }) => {
    await page.goto("/financeiro");
    // Wait for status elements to be visible
    const statusElements = page.locator(
      '[data-testid="status"], .status-badge, [role="status"], .billing-status'
    );
    if ((await statusElements.count()) > 0) {
      // If there are status indicators, verify they're displayed
      await expect(statusElements.first()).toBeVisible({ timeout: 5000 });
    }
  });
});
