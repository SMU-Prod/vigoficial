import { test, expect } from "@playwright/test";

/**
 * VIGI PRO — E2E API Health Tests
 *
 * Testa endpoints da API para garantir que estão respondendo.
 * Não requer autenticação (testa as rotas públicas + headers).
 */

test.describe("API Health", () => {
  test("login endpoint should accept POST", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: { email: "test@test.com", password: "test" },
    });
    // Should return 401 for invalid creds, not 500
    expect([401, 400, 200]).toContain(res.status());
  });

  test("protected endpoints should return 401 without auth", async ({ request }) => {
    const endpoints = [
      "/api/dashboard",
      "/api/agents/status",
      "/api/admin/iml/insights",
      "/api/admin/iml/events",
      "/api/admin/iml/playbook",
      "/api/admin/metrics",
      "/api/admin/enrich",
    ];

    for (const endpoint of endpoints) {
      const res = await request.get(endpoint);
      expect(res.status(), `${endpoint} should be protected`).toBe(401);
    }
  });

  test("webhook endpoints should be accessible", async ({ request }) => {
    // Webhooks are public (validated by signature)
    const res = await request.post("/api/webhooks/asaas", {
      data: { event: "test" },
    });
    // Should not be 401 (webhooks are public routes)
    expect(res.status()).not.toBe(401);
  });
});
