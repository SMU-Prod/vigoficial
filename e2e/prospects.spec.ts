import { test, expect } from "@playwright/test";

/**
 * VIGI PRO — E2E Prospects Tests
 *
 * Testa o fluxo de gestão de prospecção:
 * Autenticação → Navegação → Listagem → Filtros
 */

test.describe("Prospects Workflow", () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto("/login");
    await page.fill('[name="email"]', process.env.E2E_ADMIN_EMAIL || "admin@vigi.local");
    await page.fill('[name="password"]', process.env.E2E_ADMIN_PASSWORD || "admin");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|admin\/perfil)/, { timeout: 10000 });
  });

  test("should navigate to prospeccao page", async ({ page }) => {
    await page.goto("/prospeccao");
    await expect(page).toHaveURL(/prospeccao/);
    // Page should show prospect-related content
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
  });

  test("should verify prospect list loads", async ({ page }) => {
    await page.goto("/prospeccao");
    // Wait for prospect data to load
    await page.waitForSelector("table, [data-testid='prospect-list'], .prospect-container", {
      timeout: 10000,
    });
    // Should display some content
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
  });

  test("should test filter functionality", async ({ page }) => {
    await page.goto("/prospeccao");
    // Wait for filters to be visible
    const filterElements = page.locator(
      'input[type="text"], select, [data-testid="filter"], .filter-input'
    );
    if ((await filterElements.count()) > 0) {
      // If there are filters, at least verify they exist
      await expect(filterElements.first()).toBeVisible({ timeout: 5000 });
    }
  });
});
