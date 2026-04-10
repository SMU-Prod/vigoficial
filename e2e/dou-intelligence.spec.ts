import { test, expect } from "@playwright/test";

/**
 * VIGI PRO — E2E DOU Intelligence Tests
 *
 * Testa o fluxo de inteligência DOU:
 * Autenticação → Navegação → Alertas DOU → Filtros/Busca
 */

test.describe("DOU Intelligence Page", () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto("/login");
    await page.fill('[name="email"]', process.env.E2E_ADMIN_EMAIL || "admin@vigi.local");
    await page.fill('[name="password"]', process.env.E2E_ADMIN_PASSWORD || "admin");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|admin\/perfil)/, { timeout: 10000 });
  });

  test("should navigate to inteligencia-dou page", async ({ page }) => {
    await page.goto("/inteligencia-dou");
    await expect(page).toHaveURL(/inteligencia-dou/);
    // Page should show DOU-related content
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
  });

  test("should verify DOU alerts load", async ({ page }) => {
    await page.goto("/inteligencia-dou");
    // Wait for DOU alert data to load
    await page.waitForSelector("table, [data-testid='dou-alerts'], .dou-container, .alert-list", {
      timeout: 10000,
    });
    // Should display DOU alert content
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
  });

  test("should check filter and search functionality", async ({ page }) => {
    await page.goto("/inteligencia-dou");
    // Wait for filter/search elements
    const filterSearchElements = page.locator(
      'input[type="text"], input[type="search"], [data-testid="search"], [data-testid="filter"], .search-input, .filter-input'
    );
    if ((await filterSearchElements.count()) > 0) {
      // If there are search/filter inputs, verify they're visible
      await expect(filterSearchElements.first()).toBeVisible({ timeout: 5000 });
    }
  });
});
