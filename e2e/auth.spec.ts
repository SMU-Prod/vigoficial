import { test, expect } from "@playwright/test";

/**
 * VIGI PRO — E2E Auth Tests
 *
 * Testa o fluxo completo de autenticação:
 * Login → Cookie → Dashboard → Logout
 */

test.describe("Auth Flow", () => {
  test("should redirect to login when not authenticated", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("should show login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("should show error on invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', "invalid@test.com");
    await page.fill('input[type="password"]', "wrongpassword");
    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.locator('[role="alert"], .error, [data-testid="error"]')).toBeVisible({
      timeout: 5000,
    });
  });

  test("should login successfully and redirect to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', process.env.E2E_ADMIN_EMAIL || "admin@vigi.local");
    await page.fill('input[type="password"]', process.env.E2E_ADMIN_PASSWORD || "admin");

    await page.click('button[type="submit"]');

    // Should go through /auth/callback and land on dashboard (or profile if must change pwd)
    await page.waitForURL(/\/(dashboard|admin\/perfil)/, { timeout: 10000 });

    // Should have auth cookie set
    const cookies = await page.context().cookies();
    const authCookie = cookies.find((c) => c.name === "vigi_token");
    expect(authCookie).toBeDefined();
    expect(authCookie?.httpOnly).toBe(true);
  });

  test("should protect admin routes", async ({ page }) => {
    await page.goto("/admin/empresas");
    await expect(page).toHaveURL(/\/login/);
  });
});
