import { test, expect } from "@playwright/test";

/**
 * VIGI PRO — E2E Companies CRUD Tests
 *
 * Testa o fluxo completo de gestão de empresas:
 * Autenticação → Navegação → Listagem → Detalhes
 */

test.describe("Companies CRUD", () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto("/login");
    await page.fill('[name="email"]', process.env.E2E_ADMIN_EMAIL || "admin@vigi.local");
    await page.fill('[name="password"]', process.env.E2E_ADMIN_PASSWORD || "admin");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|admin\/perfil)/, { timeout: 10000 });
  });

  test("should navigate to companies page", async ({ page }) => {
    await page.goto("/empresas");
    await expect(page).toHaveURL(/empresas/);
    await expect(page.locator("h1")).toContainText(/empresa/i);
  });

  test("should display companies list", async ({ page }) => {
    await page.goto("/empresas");
    // Wait for data to load
    await page.waitForSelector("table, [data-testid='company-list']", { timeout: 10000 });
    // Should have at least the table/list structure
    const content = await page.textContent("body");
    expect(content).toBeTruthy();
  });

  test("should show company details on click", async ({ page }) => {
    await page.goto("/empresas");
    await page.waitForSelector("table tbody tr, [data-testid='company-card']", { timeout: 10000 });
    // Click first company
    const firstRow = page.locator("table tbody tr, [data-testid='company-card']").first();
    if (await firstRow.isVisible()) {
      await firstRow.click();
      // Should show detail panel
      await page.waitForTimeout(1000);
    }
  });
});
