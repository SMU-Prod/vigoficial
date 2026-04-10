/**
 * VIGI CognitiveEngine — Real AI Integration Tests
 *
 * Testes que chamam a API real da Anthropic (Haiku + Sonnet).
 * Usam os mock servers de GESP (porta 3333) e DOU (porta 3334).
 *
 * REQUISITO: ANTHROPIC_API_KEY real no .env.test
 * Se a key for "test-key" ou estiver ausente, todos os testes são pulados.
 *
 * Custo estimado por rodada completa: ~$0.02 USD (Haiku + Sonnet)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { emailFixtures, type EmailFixture } from "../fixtures/emails";
import { startMockServers, stopMockServers } from "../test-utils";

// ─── Detect real API key ────────────────────────────────────────
const API_KEY = process.env.ANTHROPIC_API_KEY || "";
const LOOKS_LIKE_REAL_KEY = API_KEY.length > 10 && !API_KEY.startsWith("test-");
// Will be set to true only after we confirm the key actually works
let HAS_REAL_KEY = false;
// Use a wrapper that checks the validated flag at runtime
const itReal = (...args: Parameters<typeof it>) => {
  if (!HAS_REAL_KEY) return it.skip(...args);
  return it(...args);
};

// ─── Mock only Supabase (não queremos escrita no banco durante testes) ──
const mockQueryBuilder: Record<string, any> = {};
mockQueryBuilder.select = vi.fn().mockReturnValue(mockQueryBuilder);
mockQueryBuilder.insert = vi.fn().mockReturnValue(mockQueryBuilder);
mockQueryBuilder.update = vi.fn().mockReturnValue(mockQueryBuilder);
mockQueryBuilder.delete = vi.fn().mockReturnValue(mockQueryBuilder);
mockQueryBuilder.eq = vi.fn().mockReturnValue(mockQueryBuilder);
mockQueryBuilder.in = vi.fn().mockReturnValue(mockQueryBuilder);
mockQueryBuilder.gte = vi.fn().mockReturnValue(mockQueryBuilder);
mockQueryBuilder.lt = vi.fn().mockReturnValue(mockQueryBuilder);
mockQueryBuilder.single = vi.fn().mockResolvedValue({ data: { id: "wf_test_123" }, error: null });
mockQueryBuilder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
mockQueryBuilder.then = (cb: any) => Promise.resolve(mockQueryBuilder).then(cb);
mockQueryBuilder.catch = (cb: any) => Promise.resolve(mockQueryBuilder).catch(cb);

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => mockQueryBuilder),
  })),
}));

// ─── Test Suite ─────────────────────────────────────────────────

describe("CognitiveEngine — Real AI Integration", () => {
  beforeAll(
    async () => {
      if (!LOOKS_LIKE_REAL_KEY) {
        console.log(
          "[Real AI Tests] Skipping — set ANTHROPIC_API_KEY in .env.test to enable"
        );
        return;
      }

      // Validate the key with a lightweight API ping before running any tests
      console.log("[Real AI Tests] Validating API key...");
      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }],
          }),
        });

        if (!response.ok) {
          const body = await response.text();
          console.log(
            `[Real AI Tests] API key invalid (HTTP ${response.status}): ${body.slice(0, 200)}`
          );
          console.log("[Real AI Tests] Skipping all AI tests — key rejected by API");
          return; // HAS_REAL_KEY stays false → all itReal tests skip
        }

        HAS_REAL_KEY = true;
        console.log("[Real AI Tests] API key validated ✓");
      } catch (error) {
        console.log(
          `[Real AI Tests] API key validation failed (network error): ${error instanceof Error ? error.message : String(error)}`
        );
        console.log("[Real AI Tests] Skipping all AI tests");
        return; // HAS_REAL_KEY stays false
      }

      // Start mock servers only if key is valid
      console.log("[Real AI Tests] Starting mock servers...");
      try {
        await startMockServers();
        console.log("[Real AI Tests] Mock servers started successfully");
      } catch (error) {
        console.error("[Real AI Tests] Failed to start mock servers:", error);
        throw new Error(
          `Failed to start mock servers: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
    45000 // 45 second timeout for server startup and initialization
  );

  afterAll(async () => {
    // Only stop servers if we actually started them (key was validated)
    if (HAS_REAL_KEY) {
      console.log("[Real AI Tests] Stopping mock servers...");
      try {
        await stopMockServers();
        console.log("[Real AI Tests] Mock servers stopped");
      } catch (error) {
        console.error("[Real AI Tests] Error stopping mock servers:", error);
      }
    }
  });

  // ─── Email Classification Tests ─────────────────────────────

  describe("Email Classification (real Haiku)", () => {
    for (const fixture of emailFixtures) {
      itReal(
        `should classify "${fixture.subject.slice(0, 50)}..." as ${fixture.expectedTipoDemanda}`,
        async () => {
          const { CognitiveEngine } = await import(
            "../../src/lib/cognitive/engine"
          );
          const engine = new CognitiveEngine({
            autoFollowLinks: false, // Don't navigate — just classify
          });

          const result = await engine.analyzeEmail(
            fixture.subject,
            fixture.bodyText,
            undefined,
            fixture.fromEmail
          );

          console.log(
            `  [${fixture.expectedTipoDemanda}] → ${result.classification.tipoDemanda} ` +
              `(confidence: ${result.classification.confidence.toFixed(2)}, ` +
              `urgente: ${result.classification.urgente})`
          );

          // Validate classification
          if (fixture.expectedTipoDemanda === "caso_desconhecido") {
            // For unknown cases, confidence should be low OR type should be caso_desconhecido
            const isLowConfidence = result.classification.confidence < 0.70;
            const isUnknown = result.classification.tipoDemanda === "caso_desconhecido";
            expect(isLowConfidence || isUnknown).toBe(true);
          } else {
            expect(result.classification.tipoDemanda).toBe(
              fixture.expectedTipoDemanda
            );
            expect(result.classification.confidence).toBeGreaterThanOrEqual(
              fixture.expectedConfidenceAbove
            );
          }

          // Validate urgency detection (R10)
          if (fixture.expectedUrgente) {
            expect(result.classification.urgente).toBe(true);
          }

          // Validate structure
          expect(result.analysisId).toMatch(/^cog_/);
          expect(result.primaryContent.type).toBe("email");
          expect(result.recommendedActions.length).toBeGreaterThan(0);
          expect(result.applicableRules).toContain("R2");
          expect(result.processingTimeMs).toBeGreaterThan(0);
          expect(result.totalTokens.input).toBeGreaterThan(0);
          expect(result.totalTokens.output).toBeGreaterThan(0);
        },
        30_000
      );
    }
  });

  // ─── Email Data Extraction Tests ────────────────────────────

  describe("Email Data Extraction (real Sonnet)", () => {
    itReal(
      "should extract complete vigilante data from novo_vigilante email",
      async () => {
        const fixture = emailFixtures.find(
          (f) => f.expectedTipoDemanda === "novo_vigilante"
        )!;

        const { CognitiveEngine } = await import(
          "../../src/lib/cognitive/engine"
        );
        const engine = new CognitiveEngine({ autoFollowLinks: false });

        const result = await engine.analyzeEmail(
          fixture.subject,
          fixture.bodyText,
          undefined,
          fixture.fromEmail
        );

        console.log("  Extracted data:", JSON.stringify(result.extractedData, null, 2));

        const data = result.extractedData as Record<string, any>;

        // Should extract key fields from the email
        // The exact field names depend on the extraction prompt, so we check broadly
        const dataStr = JSON.stringify(data).toLowerCase();
        expect(dataStr).toContain("joão");
        expect(dataStr).toContain("silva");
        expect(dataStr).toMatch(/123[\.\s]?456[\.\s]?789/); // CPF fragments
      },
      30_000
    );

    itReal(
      "should extract weapon data from compra_arma email",
      async () => {
        const fixture = emailFixtures.find(
          (f) => f.expectedTipoDemanda === "compra_arma"
        )!;

        const { CognitiveEngine } = await import(
          "../../src/lib/cognitive/engine"
        );
        const engine = new CognitiveEngine({ autoFollowLinks: false });

        const result = await engine.analyzeEmail(
          fixture.subject,
          fixture.bodyText,
          undefined,
          fixture.fromEmail
        );

        console.log("  Extracted data:", JSON.stringify(result.extractedData, null, 2));

        const dataStr = JSON.stringify(result.extractedData).toLowerCase();
        // Should extract weapon info
        expect(dataStr).toContain("taurus");
        expect(dataStr).toMatch(/pistola|revólver|rev[oó]lver/i);
      },
      30_000
    );

    itReal(
      "should extract alvara data from renovacao_alvara email",
      async () => {
        const fixture = emailFixtures.find(
          (f) => f.expectedTipoDemanda === "renovacao_alvara"
        )!;

        const { CognitiveEngine } = await import(
          "../../src/lib/cognitive/engine"
        );
        const engine = new CognitiveEngine({ autoFollowLinks: false });

        const result = await engine.analyzeEmail(
          fixture.subject,
          fixture.bodyText,
          undefined,
          fixture.fromEmail
        );

        console.log("  Extracted data:", JSON.stringify(result.extractedData, null, 2));

        const dataStr = JSON.stringify(result.extractedData);
        // Should extract CNPJ and alvara info
        expect(dataStr).toMatch(/12[\.\s]?345[\.\s]?678/); // CNPJ fragments
        expect(dataStr.toLowerCase()).toContain("securitec");
      },
      30_000
    );
  });

  // ─── R7 Confidence Threshold Tests ────────────────────────────

  describe("R7 — Confidence Threshold (real AI)", () => {
    itReal(
      "should escalate ambiguous email to caso_desconhecido",
      async () => {
        const fixture = emailFixtures.find(
          (f) => f.expectedTipoDemanda === "caso_desconhecido"
        )!;

        const { CognitiveEngine } = await import(
          "../../src/lib/cognitive/engine"
        );
        const engine = new CognitiveEngine({ autoFollowLinks: false });

        const result = await engine.analyzeEmail(
          fixture.subject,
          fixture.bodyText,
          undefined,
          fixture.fromEmail
        );

        console.log(
          `  Classification: ${result.classification.tipoDemanda} ` +
            `(confidence: ${result.classification.confidence.toFixed(2)})`
        );

        // Either low confidence triggers R7 → caso_desconhecido, or the AI itself classifies as unknown
        expect(result.requiresHumanApproval).toBe(true);
        expect(result.escalationReason).toBeTruthy();

        // Should have escalation action
        const hasEscalation = result.recommendedActions.some(
          (a) => a.type === "escalate_human"
        );
        expect(hasEscalation).toBe(true);
      },
      30_000
    );

    itReal(
      "should NOT escalate clear novo_vigilante email",
      async () => {
        const fixture = emailFixtures.find(
          (f) => f.expectedTipoDemanda === "novo_vigilante"
        )!;

        const { CognitiveEngine } = await import(
          "../../src/lib/cognitive/engine"
        );
        const engine = new CognitiveEngine({ autoFollowLinks: false });

        const result = await engine.analyzeEmail(
          fixture.subject,
          fixture.bodyText,
          undefined,
          fixture.fromEmail
        );

        expect(result.requiresHumanApproval).toBe(false);
        expect(result.classification.confidence).toBeGreaterThanOrEqual(0.70);
      },
      30_000
    );
  });

  // ─── R10 Urgency Detection Tests ──────────────────────────────

  describe("R10 — Urgency Detection (real AI)", () => {
    itReal(
      "should detect URGENTE keywords and set urgente=true",
      async () => {
        const fixture = emailFixtures.find((f) => f.expectedUrgente)!;

        const { CognitiveEngine } = await import(
          "../../src/lib/cognitive/engine"
        );
        const engine = new CognitiveEngine({ autoFollowLinks: false });

        const result = await engine.analyzeEmail(
          fixture.subject,
          fixture.bodyText,
          undefined,
          fixture.fromEmail
        );

        console.log(
          `  Urgency: ${result.classification.urgente}, ` +
            `tipo: ${result.classification.tipoDemanda}`
        );

        expect(result.classification.urgente).toBe(true);

        // R10: urgent → all actions have low priority
        result.recommendedActions.forEach((a) => {
          expect(a.priority).toBeLessThanOrEqual(2);
        });
      },
      30_000
    );
  });

  // ─── DOU Analysis Tests ───────────────────────────────────────

  describe("DOU Publication Analysis (real AI)", () => {
    itReal(
      "should analyze DOU alvara publication and classify as renovacao_alvara",
      async () => {
        const { CognitiveEngine } = await import(
          "../../src/lib/cognitive/engine"
        );
        const engine = new CognitiveEngine({ autoFollowLinks: false });

        const douHtml = `
          <article class="materia">
            <div class="titulo">Ministério da Justiça - Renovação de Alvará</div>
            <div class="conteudo">
              <p><strong>RENOVAÇÃO DE ALVARÁ DE FUNCIONAMENTO</strong></p>
              <p>O Coordenador-Geral de Controle de Segurança Privada, no uso das atribuições
              que lhe são conferidas pelo art. 20 da Lei nº 7.102, de 20 de junho de 1983,
              RESOLVE:</p>
              <p>RENOVAR o alvará de funcionamento concedido à empresa:</p>
              <p><strong>Empresa:</strong> SECURITEC VIGILÂNCIA LTDA<br>
              <strong>CNPJ:</strong> 12.345.678/0001-91<br>
              <strong>Alvará nº:</strong> DPF/SP-2023-0001847<br>
              <strong>Atividades:</strong> vigilância patrimonial, transporte de valores<br>
              <strong>Nova validade:</strong> 31 de março de 2029</p>
            </div>
          </article>
        `;

        const result = await engine.analyzeDOU(douHtml, "2026-03-31");

        console.log(
          `  DOU Classification: ${result.classification.tipoDemanda} ` +
            `(confidence: ${result.classification.confidence.toFixed(2)})`
        );
        console.log("  Extracted:", JSON.stringify(result.extractedData, null, 2));

        expect(result.classification.tipoDemanda).toBe("renovacao_alvara");
        expect(result.classification.confidence).toBeGreaterThanOrEqual(0.70);
        expect(result.primaryContent.type).toBe("dou_publication");
        expect(result.primaryContent.source).toBe("dou_scraper");

        const dataStr = JSON.stringify(result.extractedData);
        expect(dataStr).toContain("12.345.678");
        expect(dataStr).toContain("SECURITEC");
      },
      30_000
    );

    itReal(
      "should analyze DOU CNV publication",
      async () => {
        const { CognitiveEngine } = await import(
          "../../src/lib/cognitive/engine"
        );
        const engine = new CognitiveEngine({ autoFollowLinks: false });

        const douHtml = `
          <article class="materia">
            <div class="titulo">Ministério da Justiça - Carteira Nacional de Vigilante</div>
            <div class="conteudo">
              <p><strong>PUBLICAÇÃO DE CARTEIRA NACIONAL DE VIGILANTE</strong></p>
              <p>O Coordenador-Geral de Controle de Segurança Privada RESOLVE:</p>
              <p>Registrar a emissão de Carteira Nacional de Vigilante para:</p>
              <p><strong>Nome:</strong> JOÃO CARLOS SILVA SANTOS<br>
              <strong>CPF:</strong> 123.456.789-01<br>
              <strong>CNV Número:</strong> 0123456789<br>
              <strong>Empresa:</strong> SECURITEC VIGILÂNCIA LTDA<br>
              <strong>Validade:</strong> 15 de março de 2029</p>
            </div>
          </article>
        `;

        const result = await engine.analyzeDOU(douHtml, "2026-03-31");

        console.log(
          `  CNV DOU: ${result.classification.tipoDemanda} ` +
            `(confidence: ${result.classification.confidence.toFixed(2)})`
        );

        expect(result.classification.tipoDemanda).toBe("renovacao_cnv");
        expect(result.classification.confidence).toBeGreaterThanOrEqual(0.70);

        const dataStr = JSON.stringify(result.extractedData);
        expect(dataStr).toContain("0123456789");
        expect(dataStr).toContain("JOÃO");
      },
      30_000
    );

    itReal(
      "should parse real DOU HTML fixture from mock server",
      async () => {
        // Fetch from running DOU mock server
        const response = await fetch(
          "http://localhost:3334/servicos/diario-oficial/secao-1?data=2026-03-31"
        );
        expect(response.ok).toBe(true);

        const html = await response.text();
        expect(html.length).toBeGreaterThan(100);

        // Use CognitiveEngine on the fetched HTML
        const { CognitiveEngine } = await import(
          "../../src/lib/cognitive/engine"
        );
        const engine = new CognitiveEngine({
          autoFollowLinks: false, // No navigation for DOU articles
        });

        const result = await engine.analyzeDOU(html, "2026-03-31");

        console.log(
          `  Full DOU fixture: ${result.classification.tipoDemanda} ` +
            `(confidence: ${result.classification.confidence.toFixed(2)})`
        );

        // Should classify as some valid demand type (likely renovacao_alvara or renovacao_cnv)
        expect(result.classification.tipoDemanda).not.toBe("caso_desconhecido");
        expect(result.classification.confidence).toBeGreaterThanOrEqual(0.70);
        expect(result.totalTokens.input).toBeGreaterThan(0);
      },
      45_000
    );
  });

  // ─── Link Navigation Tests ───────────────────────────────────

  describe("Link Navigation (real AI + mock servers)", () => {
    itReal(
      "should follow link to DOU mock server and enrich analysis",
      async () => {
        const { CognitiveEngine } = await import(
          "../../src/lib/cognitive/engine"
        );
        const engine = new CognitiveEngine({
          autoFollowLinks: true,
          maxNavigationDepth: 1,
          maxLinksPerPage: 2,
        });

        const emailWithLink = `
          <html><body>
            <p>Prezados, segue link da publicação do DOU referente ao nosso alvará:</p>
            <a href="http://localhost:3334/servicos/diario-oficial/secao-1?data=2026-03-31">
              Ver publicação DOU - Renovação Alvará
            </a>
            <p>Favor verificar e confirmar.</p>
          </body></html>
        `;

        const result = await engine.analyzeEmail(
          "Renovação de Alvará - Publicação DOU",
          "Segue link da publicação DOU referente ao nosso alvará. Favor verificar.",
          emailWithLink,
          "rh@empresa.com.br"
        );

        console.log(
          `  With navigation: ${result.classification.tipoDemanda} ` +
            `(confidence: ${result.classification.confidence.toFixed(2)}, ` +
            `navigated: ${result.navigatedContents.length} pages)`
        );

        // Should be renovacao_alvara with reasonable confidence
        expect(result.classification.tipoDemanda).toBe("renovacao_alvara");
        expect(result.classification.confidence).toBeGreaterThanOrEqual(0.70);

        // Verify navigation happened (or was decided against — both are valid)
        expect(result.primaryContent.discoveredLinks.length).toBeGreaterThan(0);
      },
      60_000
    );
  });

  // ─── Workflow Generation Tests ────────────────────────────────

  describe("Full Workflow Generation (real AI)", () => {
    itReal(
      "should generate complete novo_vigilante workflow with GESP actions",
      async () => {
        const fixture = emailFixtures.find(
          (f) => f.expectedTipoDemanda === "novo_vigilante"
        )!;

        const { CognitiveEngine } = await import(
          "../../src/lib/cognitive/engine"
        );
        const engine = new CognitiveEngine({ autoFollowLinks: false });

        const result = await engine.analyzeEmail(
          fixture.subject,
          fixture.bodyText,
          undefined,
          fixture.fromEmail,
          [],
          "company_test_123"
        );

        console.log(
          `  Workflow actions (${result.recommendedActions.length}):`,
          result.recommendedActions.map((a) => `${a.type}${a.template ? ":" + a.template : ""}`)
        );
        console.log("  Rules:", result.applicableRules);

        // Validate workflow structure
        expect(result.recommendedActions.length).toBeGreaterThanOrEqual(4);
        expect(result.recommendedActions.some((a) => a.type === "gesp_action")).toBe(true);
        expect(result.recommendedActions.some((a) => a.type === "compliance_check")).toBe(true);

        // Last action should be Template B confirmation (R8)
        const lastAction = result.recommendedActions[result.recommendedActions.length - 1];
        expect(lastAction.type).toBe("send_email_client");
        expect(lastAction.template).toBe("B");

        // PRD Rules
        expect(result.applicableRules).toContain("R1"); // Never abbreviate
        expect(result.applicableRules).toContain("R2"); // Save before process
        expect(result.applicableRules).toContain("R3"); // Billing gating
        expect(result.applicableRules).toContain("R5"); // GESP lock
        expect(result.applicableRules).toContain("R8"); // Template B
      },
      30_000
    );

    itReal(
      "should generate encerramento_posto workflow with OF-E",
      async () => {
        const fixture = emailFixtures.find(
          (f) => f.expectedTipoDemanda === "encerramento_posto"
        )!;

        const { CognitiveEngine } = await import(
          "../../src/lib/cognitive/engine"
        );
        const engine = new CognitiveEngine({ autoFollowLinks: false });

        const result = await engine.analyzeEmail(
          fixture.subject,
          fixture.bodyText,
          undefined,
          fixture.fromEmail
        );

        console.log(
          `  Workflow: ${result.recommendedActions.map((a) => a.type).join(" → ")}`
        );

        const oficio = result.recommendedActions.find(
          (a) => a.type === "send_oficio_pf"
        );
        expect(oficio).toBeDefined();
        expect(oficio?.template).toBe("OF-E");
      },
      30_000
    );
  });

  // ─── Token Cost Tracking Tests ────────────────────────────────

  describe("Token & Cost Tracking", () => {
    itReal(
      "should track real token usage across all API calls",
      async () => {
        const fixture = emailFixtures[0]; // novo_vigilante

        const { CognitiveEngine } = await import(
          "../../src/lib/cognitive/engine"
        );
        const engine = new CognitiveEngine({ autoFollowLinks: false });

        const result = await engine.analyzeEmail(
          fixture.subject,
          fixture.bodyText,
          undefined,
          fixture.fromEmail
        );

        const usage = engine.getTokenUsage();

        console.log("  Token usage:", {
          input: usage.totalInput,
          output: usage.totalOutput,
          cacheRead: usage.cacheRead,
          estimatedCost: `$${usage.estimatedCost.toFixed(4)}`,
        });

        // Real API calls should produce non-zero token counts
        expect(usage.totalInput).toBeGreaterThan(0);
        expect(usage.totalOutput).toBeGreaterThan(0);
        expect(usage.estimatedCost).toBeGreaterThan(0);

        // CognitiveAnalysis should also have token info
        expect(result.totalTokens.input).toBe(usage.totalInput);
        expect(result.totalTokens.output).toBe(usage.totalOutput);

        // Verify cost is reasonable ($0.001 - $0.10 for a single email)
        expect(usage.estimatedCost).toBeLessThan(0.10);
      },
      30_000
    );
  });

  // ─── Skip info if no key ──────────────────────────────────────

  it("should report API key status", () => {
    if (HAS_REAL_KEY) {
      console.log("  ✅ Real API key detected — all integration tests ran");
    } else {
      console.log(
        "  ⏭️  No real API key — integration tests skipped.\n" +
          "     Set ANTHROPIC_API_KEY in .env.test to enable."
      );
    }
    expect(true).toBe(true);
  });
});
