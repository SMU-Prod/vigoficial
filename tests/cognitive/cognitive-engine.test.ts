/**
 * VIGI CognitiveEngine — Unit Tests
 *
 * Testes que NÃO dependem de API real (mocks para Claude).
 * Valida: DocumentProcessor, WorkflowResolver, PageNavigator, CognitiveEngine, CognitiveCaptador.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DocumentProcessor } from "../../src/lib/cognitive/document-processor";
import { WorkflowResolver } from "../../src/lib/cognitive/workflow-resolver";
import { PageNavigator } from "../../src/lib/cognitive/page-navigator";
import type {
  TipoDemanda,
  CognitiveAnalysis,
  ContentUnit,
} from "../../src/lib/cognitive/types";

// ─── DocumentProcessor Tests ─────────────────────────────────────
describe("DocumentProcessor", () => {
  let processor: DocumentProcessor;

  beforeEach(() => {
    processor = new DocumentProcessor();
  });

  describe("process()", () => {
    it("should process email content and extract metadata", async () => {
      const result = await processor.process(
        "<p>Segue dados do novo vigilante João da Silva, CPF 123.456.789-00</p>",
        "email",
        "gmail",
        {
          subject: "Cadastro de Novo Vigilante",
          fromEmail: "empresa@teste.com",
          bodyText: "Segue dados do novo vigilante João da Silva, CPF 123.456.789-00",
          bodyHtml: "<p>Segue dados do novo vigilante João da Silva, CPF 123.456.789-00</p>",
          attachmentCount: 1,
          attachments: [{ name: "cnv.pdf", url: "https://example.com/cnv.pdf", type: "application/pdf" }],
        }
      );

      expect(result.type).toBe("email");
      expect(result.source).toBe("gmail");
      expect(result.title).toBe("Cadastro de Novo Vigilante");
      expect(result.depth).toBe(0);
      expect(result.rawText).toContain("João da Silva");
      expect(result.discoveredAttachments).toHaveLength(1);
      expect(result.discoveredAttachments[0].type).toBe("pdf");
      expect(result.discoveredAttachments[0].name).toBe("cnv.pdf");
    });

    it("should extract links from HTML content", async () => {
      const html = `
        <html>
          <body>
            <h1>DOU Seção 1</h1>
            <a href="https://dou.gov.br/article/123">Alvará Renovado - Segurança ABC</a>
            <a href="https://dou.gov.br/article/456">Portaria 18.045 - Atualização</a>
            <a href="#top">Voltar ao topo</a>
            <a href="javascript:void(0)">Fechar</a>
          </body>
        </html>
      `;

      const result = await processor.process(html, "html_page", "dou_scraper");

      // Should extract real links, skip anchors and javascript
      expect(result.discoveredLinks.length).toBe(2);
      expect(result.discoveredLinks[0].url).toBe("https://dou.gov.br/article/123");
      expect(result.discoveredLinks[0].text).toContain("Alvará Renovado");
      expect(result.discoveredLinks[1].url).toBe("https://dou.gov.br/article/456");
    });

    it("should extract buttons with onclick URLs", async () => {
      const html = `
        <html>
          <body>
            <button onclick="window.location.href='https://gesp.dpf.gov.br/vigilantes'">Ver Vigilantes</button>
            <form action="/api/submit">
              <input type="submit" value="Enviar" />
            </form>
          </body>
        </html>
      `;

      const result = await processor.process(html, "gesp_page", "gesp_portal");

      const buttons = result.discoveredLinks.filter((l) => l.type === "button");
      const forms = result.discoveredLinks.filter((l) => l.type === "form_action");

      expect(buttons.length).toBe(1);
      expect(buttons[0].text).toContain("Ver Vigilantes");
      expect(forms.length).toBe(1);
      expect(forms[0].url).toBe("/api/submit");
    });

    it("should extract URLs from plain text (PDF fallback)", async () => {
      const pdfText = `
        Conforme Portaria 18.045/2023, disponível em:
        https://www.gov.br/pf/portaria-18045
        Para mais detalhes: https://gesp.dpf.gov.br/docs/manual.pdf
      `;

      const result = await processor.process(pdfText, "pdf", "r2_storage");

      expect(result.discoveredLinks.length).toBe(2);
      expect(result.discoveredLinks[0].url).toContain("gov.br/pf/portaria");
      expect(result.discoveredLinks[1].url).toContain("manual.pdf");
    });

    it("should detect attachment types correctly", async () => {
      const result = await processor.process("email body", "email", "gmail", {
        bodyText: "email body",
        attachments: [
          { name: "alvara.pdf" },
          { name: "foto_vigilante.jpg" },
          { name: "planilha.xlsx" },
          { name: "contrato.docx" },
          { name: "dados.csv" },
          { name: "arquivo.zip" },
        ],
      });

      const types = result.discoveredAttachments.map((a) => a.type);
      expect(types).toEqual(["pdf", "image", "spreadsheet", "document", "spreadsheet", "other"]);
    });

    it("should extract title from HTML <title> tag", async () => {
      const html = `<html><head><title>Portal GESP - Dashboard</title></head><body>content</body></html>`;
      const result = await processor.process(html, "gesp_page", "gesp_portal");
      expect(result.title).toBe("Portal GESP - Dashboard");
    });

    it("should track depth and parentId", async () => {
      const result = await processor.process(
        "sub-page content",
        "html_page",
        "url_fetch",
        { parentId: "cu_parent_123" },
        2,
        "cu_parent_123"
      );

      expect(result.depth).toBe(2);
      expect(result.parentId).toBe("cu_parent_123");
    });
  });

  describe("stripHtml()", () => {
    it("should remove all HTML tags and decode entities", () => {
      const html = `<p>Empresa &amp; Segurança <strong>LTDA</strong></p>
        <script>alert("xss")</script>
        <style>.hidden{display:none}</style>`;

      const text = processor.stripHtml(html);
      expect(text).toContain("Empresa & Segurança LTDA");
      expect(text).not.toContain("<script>");
      expect(text).not.toContain("<style>");
      expect(text).not.toContain("alert");
    });
  });
});

// ─── WorkflowResolver Tests ──────────────────────────────────────
describe("WorkflowResolver", () => {
  let resolver: WorkflowResolver;

  beforeEach(() => {
    resolver = new WorkflowResolver();
  });

  describe("resolve()", () => {
    it("should resolve novo_vigilante workflow with GESP action", () => {
      const { actions, rules } = resolver.resolve(
        "novo_vigilante",
        { nome_completo: "João da Silva", cpf: "12345678900", data_nascimento: "1990-01-15" },
        false,
        "company_123"
      );

      // Should have extraction, billing check, GESP action, DB update, and confirmation
      expect(actions.length).toBeGreaterThanOrEqual(4);
      expect(actions.some((a) => a.type === "gesp_action")).toBe(true);
      expect(actions.some((a) => a.type === "compliance_check")).toBe(true);
      expect(actions[actions.length - 1].type).toBe("send_email_client"); // Template B
      expect(actions[actions.length - 1].template).toBe("B");

      // Rules should include R1 (never abbreviate), R3 (billing), R4 (batch), R5 (lock), R8 (confirm)
      expect(rules).toContain("R1");
      expect(rules).toContain("R3");
      expect(rules).toContain("R4");
      expect(rules).toContain("R5");
      expect(rules).toContain("R8");
    });

    it("should resolve novo_posto workflow with OF-A ofício", () => {
      const { actions, rules } = resolver.resolve(
        "novo_posto",
        { nome: "Posto Central", endereco: "Rua A, 123", cidade: "São Paulo", uf: "SP" },
        false,
        "company_123"
      );

      expect(actions.some((a) => a.type === "send_oficio_pf")).toBe(true);
      const oficio = actions.find((a) => a.type === "send_oficio_pf");
      expect(oficio?.template).toBe("OF-A");

      // R11 (PF = plain text) and R12 (DELESP by post state)
      expect(rules).toContain("R11");
      expect(rules).toContain("R12");
    });

    it("should resolve compra_arma with OF-B", () => {
      const { actions } = resolver.resolve(
        "compra_arma",
        { numero_serie: "ABC123", tipo: "Pistola" },
        false
      );

      const oficio = actions.find((a) => a.type === "send_oficio_pf");
      expect(oficio?.template).toBe("OF-B");
    });

    it("should resolve encerramento_posto with OF-E", () => {
      const { actions } = resolver.resolve(
        "encerramento_posto",
        { nome_posto: "Posto Oeste" },
        false
      );

      const oficio = actions.find((a) => a.type === "send_oficio_pf");
      expect(oficio?.template).toBe("OF-E");
    });

    it("should resolve transporte_equipamento with OF-C", () => {
      const { actions } = resolver.resolve(
        "transporte_equipamento",
        { itens: ["Pistola 9mm"], origem: "SP", destino: "RJ" },
        false
      );

      const oficio = actions.find((a) => a.type === "send_oficio_pf");
      expect(oficio?.template).toBe("OF-C");
    });

    it("should resolve caso_desconhecido with Template E escalation", () => {
      const { actions, rules } = resolver.resolve("caso_desconhecido", {}, false);

      // 1 escalation step (from workflow def) + 1 Template B confirmation = 2 actions
      expect(actions.length).toBe(2);
      expect(actions[0].type).toBe("escalate_human");
      expect(actions[0].template).toBe("E");
      // The payload contains tipoDemanda from the workflow resolver
      expect(actions[0].payload.tipoDemanda).toBe("caso_desconhecido");
      expect(rules).toContain("R7");
    });

    it("should set priority 1 for urgent demands (R10)", () => {
      const { actions, rules } = resolver.resolve(
        "novo_vigilante",
        { nome_completo: "Maria", cpf: "98765432100", data_nascimento: "1985-05-20" },
        true, // urgente
        "company_123"
      );

      // All actions should have priority 1 or 2
      actions.forEach((a) => {
        expect(a.priority).toBeLessThanOrEqual(2);
      });
      expect(rules).toContain("R10");
    });

    it("should always include R2 (save before process) and R8 (confirm)", () => {
      const demandas: TipoDemanda[] = [
        "novo_vigilante",
        "compra_arma",
        "renovacao_cnv",
        "caso_desconhecido",
      ];

      for (const tipo of demandas) {
        const { rules } = resolver.resolve(tipo, {}, false);
        expect(rules).toContain("R2");
        // caso_desconhecido doesn't have R8 (no action to confirm)
        if (tipo !== "caso_desconhecido") {
          expect(rules).toContain("R8");
        }
      }
    });

    it("should chain actions with dependsOn", () => {
      const { actions } = resolver.resolve(
        "novo_vigilante",
        { nome_completo: "Test", cpf: "11122233344", data_nascimento: "2000-01-01" },
        false
      );

      // Each action (except first) should depend on the previous
      for (let i = 1; i < actions.length; i++) {
        expect(actions[i].dependsOn.length).toBeGreaterThan(0);
      }
    });

    it("should set correct targetAgent for each action type", () => {
      const { actions } = resolver.resolve(
        "correcao_dados",
        { campo_a_corrigir: "nome", valor_correto: "João" },
        false
      );

      const gespAction = actions.find((a) => a.type === "gesp_action");
      expect(gespAction?.targetAgent).toBe("operacional");

      const screenshot = actions.find((a) => a.type === "take_screenshot");
      expect(screenshot?.targetAgent).toBe("operacional");
    });
  });

  describe("getDefinition()", () => {
    it("should return definition for all 15 tipos de demanda", () => {
      const tipos: TipoDemanda[] = [
        "novo_vigilante", "novo_posto", "compra_arma", "venda_arma",
        "transporte_equipamento", "encerramento_posto", "transferencia_posto",
        "renovacao_cnv", "compra_colete", "baixa_colete", "correcao_dados",
        "manutencao_veiculo", "reciclagem", "renovacao_alvara", "caso_desconhecido",
      ];

      for (const tipo of tipos) {
        const def = resolver.getDefinition(tipo);
        expect(def).toBeDefined();
        expect(def?.tipoDemanda).toBe(tipo);
        expect(def?.steps.length).toBeGreaterThan(0);
        expect(def?.prdSection).toBeTruthy();
      }
    });
  });

  describe("listWorkflows()", () => {
    it("should return all workflow definitions", () => {
      const workflows = resolver.listWorkflows();
      // Workflow count grows as new demand types are added
      expect(workflows.length).toBeGreaterThanOrEqual(15);
    });
  });
});

// ─── PageNavigator Tests ─────────────────────────────────────────
describe("PageNavigator", () => {
  let navigator: PageNavigator;

  beforeEach(() => {
    navigator = new PageNavigator(5000);
  });

  describe("fetch()", () => {
    it("should return null for GESP URLs (requires Playwright)", async () => {
      const result = await navigator.fetch("https://servicos.dpf.gov.br/gesp/dashboard");
      expect(result).toBeNull();
    });

    it("should return null for inaccessible URLs", async () => {
      // fetch throws on DNS failure; PageNavigator catches and returns null
      const result = await navigator.fetch("http://127.0.0.1:19999/nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("isAccessible()", () => {
    it("should return false for non-existent URLs", async () => {
      const result = await navigator.isAccessible("https://this-domain-does-not-exist-12345.com");
      expect(result).toBe(false);
    });
  });

  describe("basicPdfTextExtraction", () => {
    it("should extract text from PDF-like content with Tj operators", () => {
      // Simulate basic PDF content with text operators
      const navAny = navigator as unknown as { basicPdfTextExtraction: (buf: Buffer) => string | null };
      const fakePdf = Buffer.from("(Hello World) Tj (Test Document) Tj", "latin1");
      const result = navAny.basicPdfTextExtraction(fakePdf);
      expect(result).toContain("Hello World");
      expect(result).toContain("Test Document");
    });
  });
});

// ─── CognitiveEngine Tests (mocked AI) ──────────────────────────
describe("CognitiveEngine — Full Pipeline (mocked AI)", () => {
  // We need to mock all external dependencies before importing CognitiveEngine
  const mockAnthropicCreate = vi.fn();
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: "wf_123" }, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  beforeEach(async () => {
    vi.resetModules();
    mockAnthropicCreate.mockReset();

    // Mock all external modules BEFORE importing CognitiveEngine
    vi.doMock("@/lib/ai/client", () => ({
      getAnthropicClient: vi.fn(() => ({
        messages: { create: mockAnthropicCreate },
      })),
      AI_MODELS: {
        fast: "claude-haiku-4-5-20251001",
        complex: "claude-sonnet-4-6",
        advanced: "claude-sonnet-4-6",
        HAIKU: "claude-haiku-4-5-20251001",
        SONNET: "claude-sonnet-4-6",
        OPUS: "claude-sonnet-4-6",
      },
      AI_THRESHOLDS: {
        classificationConfidence: 0.70,
        classificationMaxTokens: 500,
        extractionMaxTokens: 1500,
        CONFIDENCE_THRESHOLD: 0.70,
        MAX_CLASSIFICATION_TOKENS: 500,
        MAX_EXTRACTION_TOKENS: 1500,
      },
    }));

    vi.doMock("@/lib/ai/prompts", () => ({
      CLASSIFIER_SYSTEM_PROMPT: "mock classifier prompt",
      EXTRACTOR_SYSTEM_PROMPT: "mock extractor prompt",
      EXTRACTION_PROMPTS: {
        novo_vigilante: "Extract vigilante data",
        compra_arma: "Extract weapon data",
        caso_desconhecido: "Unknown - extract what you can",
        renovacao_cnv: "Extract CNV renewal data",
        novo_posto: "Extract post data",
        venda_arma: "Extract weapon sale data",
        transporte_equipamento: "Extract transport data",
        encerramento_posto: "Extract closure data",
        transferencia_posto: "Extract transfer data",
        compra_colete: "Extract vest data",
        baixa_colete: "Extract vest decommission data",
        correcao_dados: "Extract correction data",
        manutencao_veiculo: "Extract vehicle data",
        reciclagem: "Extract recycling data",
        renovacao_alvara: "Extract license renewal data",
      },
    }));

    vi.doMock("@/lib/supabase/server", () => ({
      createSupabaseAdmin: vi.fn(() => mockSupabase),
    }));

    vi.doMock("@/lib/agents/base", () => ({
      TokenTracker: class MockTokenTracker {
        totalInput = 0;
        totalOutput = 0;
        cacheRead = 0;
        track(usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number }) {
          this.totalInput += usage?.input_tokens || 0;
          this.totalOutput += usage?.output_tokens || 0;
          this.cacheRead += usage?.cache_read_input_tokens || 0;
        }
        recordUsage(usage: { input_tokens?: number; output_tokens?: number }) {
          this.track(usage);
        }
        get totalInputTokens() { return this.totalInput; }
        get totalOutputTokens() { return this.totalOutput; }
        get cacheReadTokens() { return this.cacheRead; }
      },
      startAgentRun: vi.fn().mockResolvedValue({ runId: "run_test_123" }),
      completeAgentRun: vi.fn().mockResolvedValue(undefined),
      logAgentDecision: vi.fn().mockResolvedValue(undefined),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Helper: make a mock Anthropic API response
   */
  function mockAIResponse(jsonObj: Record<string, unknown>, tokens = { input_tokens: 100, output_tokens: 50 }) {
    return {
      content: [{ type: "text", text: JSON.stringify(jsonObj) }],
      usage: tokens,
    };
  }

  // ─── analyze() full pipeline ───────────────────────────────────

  describe("analyze() — classification pipeline", () => {
    it("should classify email as novo_vigilante with high confidence", async () => {
      // 1st call: classify (Haiku) → novo_vigilante
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({
          tipo_demanda: "novo_vigilante",
          confidence: 0.92,
          urgente: false,
          resumo: "Cadastro de novo vigilante João da Silva",
        })
      );
      // 2nd call: extractConsolidated (Sonnet)
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({
          nome_completo: "João da Silva",
          cpf: "12345678900",
          data_nascimento: "1990-01-15",
        })
      );

      const { CognitiveEngine } = await import("../../src/lib/cognitive/engine");
      const engine = new CognitiveEngine({ autoFollowLinks: false });

      const result = await engine.analyze(
        "<p>Cadastro do vigilante João da Silva CPF 123.456.789-00</p>",
        "email",
        "gmail",
        {
          subject: "Cadastro de Novo Vigilante",
          fromEmail: "empresa@test.com",
          bodyText: "Cadastro do vigilante João da Silva CPF 123.456.789-00",
        }
      );

      expect(result.classification.tipoDemanda).toBe("novo_vigilante");
      expect(result.classification.confidence).toBe(0.92);
      expect(result.classification.urgente).toBe(false);
      expect(result.requiresHumanApproval).toBe(false);
      expect(result.extractedData).toHaveProperty("nome_completo", "João da Silva");
      expect(result.recommendedActions.length).toBeGreaterThan(0);
      expect(result.applicableRules).toContain("R2");
      expect(result.analysisId).toMatch(/^cog_/);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);

      // Should have called AI twice: classify + extract
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);
    });

    it("should enforce R7: confidence < 0.70 → caso_desconhecido", async () => {
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({
          tipo_demanda: "novo_vigilante",
          confidence: 0.55,
          urgente: false,
          resumo: "Email ambíguo",
        })
      );
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({ note: "Low confidence extraction" })
      );

      const { CognitiveEngine } = await import("../../src/lib/cognitive/engine");
      const engine = new CognitiveEngine({ autoFollowLinks: false });

      const result = await engine.analyze(
        "Email genérico sem classificação clara",
        "email",
        "gmail",
        { subject: "Dúvida geral", fromEmail: "test@test.com", bodyText: "Email genérico" }
      );

      // R7: confidence 0.55 < 0.70 → caso_desconhecido
      expect(result.classification.tipoDemanda).toBe("caso_desconhecido");
      expect(result.classification.confidence).toBe(0.55);
      expect(result.requiresHumanApproval).toBe(true);
      expect(result.escalationReason).toContain("0.55");
      expect(result.escalationReason).toContain("R7");
    });

    it("should detect urgency from AI classification (R10)", async () => {
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({
          tipo_demanda: "renovacao_cnv",
          confidence: 0.95,
          urgente: true,
          resumo: "Renovação urgente de CNV prestes a vencer",
        })
      );
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({ cnv: "0123456789", nome: "Maria Santos" })
      );

      const { CognitiveEngine } = await import("../../src/lib/cognitive/engine");
      const engine = new CognitiveEngine({ autoFollowLinks: false });

      const result = await engine.analyze(
        "URGENTE: Renovação de CNV 0123456789 vence amanhã",
        "email",
        "gmail",
        { subject: "URGENTE: Renovação CNV", fromEmail: "a@b.com", bodyText: "URGENTE: Renovação" }
      );

      expect(result.classification.urgente).toBe(true);
      expect(result.applicableRules).toContain("R10");
      // Urgent → all actions should have low priority number
      result.recommendedActions.forEach((a) => {
        expect(a.priority).toBeLessThanOrEqual(2);
      });
    });

    it("should handle AI parse failure → caso_desconhecido with confidence 0", async () => {
      // Return malformed non-JSON
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "This is not JSON at all" }],
        usage: { input_tokens: 50, output_tokens: 30 },
      });
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({ note: "Fallback extraction" })
      );

      const { CognitiveEngine } = await import("../../src/lib/cognitive/engine");
      const engine = new CognitiveEngine({ autoFollowLinks: false });

      const result = await engine.analyze("broken content", "email", "gmail", {
        subject: "Test",
        fromEmail: "a@b.com",
        bodyText: "broken content",
      });

      expect(result.classification.tipoDemanda).toBe("caso_desconhecido");
      expect(result.classification.confidence).toBe(0);
      expect(result.requiresHumanApproval).toBe(true);
    });

    it("should map demand types to correct workflows via WorkflowResolver", () => {
      // This test validates workflow mapping directly through the resolver
      // (no AI mocking needed — it's a pure unit test)
      const resolver = new WorkflowResolver();

      const demands: Array<{ tipo: TipoDemanda; expectGesp: boolean; expectOficio: string | null }> = [
        { tipo: "novo_vigilante", expectGesp: true, expectOficio: null },
        { tipo: "novo_posto", expectGesp: false, expectOficio: "OF-A" },
        { tipo: "compra_arma", expectGesp: false, expectOficio: "OF-B" },
        { tipo: "venda_arma", expectGesp: false, expectOficio: "OF-B" },
        { tipo: "transporte_equipamento", expectGesp: false, expectOficio: "OF-C" },
        { tipo: "encerramento_posto", expectGesp: false, expectOficio: "OF-E" },
        { tipo: "correcao_dados", expectGesp: true, expectOficio: null }, // OF-D is in templates but not an explicit send_oficio_pf action
      ];

      for (const { tipo, expectGesp, expectOficio } of demands) {
        const def = resolver.getDefinition(tipo);
        expect(def).toBeDefined();
        expect(def?.requiresGesp).toBe(expectGesp);

        if (expectOficio) {
          expect(def?.generatesOficio).toBe(true);
          expect(def?.templates).toContain(expectOficio);
        }

        // Also test resolve() produces correct action types
        const { actions } = resolver.resolve(tipo, {}, false);

        if (expectGesp) {
          expect(actions.some((a) => a.type === "gesp_action")).toBe(true);
        }
        if (expectOficio) {
          const oficio = actions.find((a) => a.type === "send_oficio_pf");
          expect(oficio).toBeDefined();
          expect(oficio?.template).toBe(expectOficio);
        }
      }
    });
  });

  // ─── analyzeEmail() shortcut ──────────────────────────────────

  describe("analyzeEmail() — shortcut", () => {
    it("should process email with subject, body, attachments", async () => {
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({
          tipo_demanda: "compra_arma",
          confidence: 0.88,
          urgente: false,
          resumo: "Compra de arma Pistola 9mm",
        })
      );
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({ tipo_arma: "Pistola 9mm", numero_serie: "NS12345" })
      );

      const { CognitiveEngine } = await import("../../src/lib/cognitive/engine");
      const engine = new CognitiveEngine({ autoFollowLinks: false });

      const result = await engine.analyzeEmail(
        "Compra de Arma",
        "Solicitamos aquisição de Pistola 9mm NS12345",
        undefined,
        "empresa@test.com",
        [{ name: "nota_fiscal.pdf", url: "https://example.com/nf.pdf" }],
        "company_456"
      );

      expect(result.classification.tipoDemanda).toBe("compra_arma");
      expect(result.primaryContent.type).toBe("email");
      expect(result.primaryContent.source).toBe("gmail");
      expect(result.primaryContent.title).toBe("Compra de Arma");
      expect(result.primaryContent.discoveredAttachments).toHaveLength(1);
      expect(result.primaryContent.discoveredAttachments[0].type).toBe("pdf");
    });
  });

  // ─── Navigation & Reclassification ────────────────────────────

  describe("analyze() — link navigation & reclassification", () => {
    it("should navigate links when autoFollowLinks is true", async () => {
      // 1st: classify → initial classification
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({
          tipo_demanda: "caso_desconhecido",
          confidence: 0.60,
          urgente: false,
          resumo: "Email com link para mais detalhes",
        })
      );
      // 2nd: decideNavigation → follow the first link
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({
          decisions: [
            { index: 0, shouldNavigate: true, reason: "Link has more details", priority: 1 },
          ],
        })
      );
      // 3rd: reclassify → better classification after navigating
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({
          tipo_demanda: "novo_vigilante",
          confidence: 0.91,
          urgente: false,
          resumo: "After navigating, confirmed as novo_vigilante",
        })
      );
      // 4th: extractConsolidated
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({ nome_completo: "Pedro Santos", cpf: "99988877766" })
      );

      const { CognitiveEngine } = await import("../../src/lib/cognitive/engine");

      // We need to also mock PageNavigator.fetch to return content for the link
      const engine = new CognitiveEngine({
        autoFollowLinks: true,
        maxNavigationDepth: 2,
        maxLinksPerPage: 3,
      });

      // Mock the page navigator to return HTML for the fetched link
      const pageNav = (engine as unknown as { pageNavigator: PageNavigator }).pageNavigator;
      vi.spyOn(pageNav, "fetch").mockResolvedValue(
        "<html><body><h1>Detalhes do Vigilante</h1><p>Pedro Santos CPF 999.888.777-66</p></body></html>"
      );

      const html = `<html><body>
        <p>Veja detalhes:</p>
        <a href="https://example.com/details">Ver detalhes do cadastro</a>
      </body></html>`;

      const result = await engine.analyze(html, "email", "gmail", {
        subject: "Verifique detalhes",
        fromEmail: "a@b.com",
        bodyText: "Veja detalhes",
        bodyHtml: html,
      });

      // Reclassification should have improved the result
      expect(result.classification.tipoDemanda).toBe("novo_vigilante");
      expect(result.classification.confidence).toBe(0.91);
      expect(result.classification.reclassified).toBe(true);
      expect(result.classification.originalTipoDemanda).toBe("caso_desconhecido");
      expect(result.classification.originalConfidence).toBe(0.60);
      expect(result.navigatedContents.length).toBeGreaterThan(0);
    });

    it("should not navigate when depth limit is reached", async () => {
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({
          tipo_demanda: "renovacao_cnv",
          confidence: 0.85,
          urgente: false,
          resumo: "Renovação de CNV",
        })
      );
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({ cnv: "1234567890" })
      );

      const { CognitiveEngine } = await import("../../src/lib/cognitive/engine");
      const engine = new CognitiveEngine({
        autoFollowLinks: true,
        maxNavigationDepth: 0, // Depth 0 = don't navigate at all
      });

      const html = `<html><body>
        <a href="https://example.com/details">Link</a>
      </body></html>`;

      const result = await engine.analyze(html, "email", "gmail", {
        subject: "Renovação CNV",
        fromEmail: "a@b.com",
        bodyText: "Renovação",
      });

      // Should NOT navigate since depth limit is 0
      expect(result.navigatedContents).toHaveLength(0);
      // Only 2 calls: classify + extract (no navigation decision call)
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(2);
    });

    it("should not reclassify if navigated content doesn't improve confidence", async () => {
      // 1st: classify
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({
          tipo_demanda: "novo_posto",
          confidence: 0.88,
          urgente: false,
          resumo: "Novo posto de vigilância",
        })
      );
      // 2nd: decideNavigation
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({
          decisions: [{ index: 0, shouldNavigate: true, reason: "Check", priority: 1 }],
        })
      );
      // 3rd: reclassify → LOWER confidence
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({
          tipo_demanda: "novo_posto",
          confidence: 0.75,
          urgente: false,
          resumo: "Still novo_posto but less certain",
        })
      );
      // 4th: extract
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({ nome_posto: "Posto Alpha" })
      );

      const { CognitiveEngine } = await import("../../src/lib/cognitive/engine");
      const engine = new CognitiveEngine({ autoFollowLinks: true, maxNavigationDepth: 1 });

      const pageNav = (engine as unknown as { pageNavigator: PageNavigator }).pageNavigator;
      vi.spyOn(pageNav, "fetch").mockResolvedValue("<html><body>More info</body></html>");

      const html = `<html><body><a href="https://example.com/info">Info</a></body></html>`;

      const result = await engine.analyze(html, "email", "gmail", {
        subject: "Novo Posto",
        fromEmail: "a@b.com",
        bodyText: "Novo posto",
      });

      // Should keep ORIGINAL classification since reclassified had lower confidence
      expect(result.classification.confidence).toBe(0.88);
      expect(result.classification.reclassified).toBe(false);
    });
  });

  // ─── analyzeDOU() ─────────────────────────────────────────────

  describe("analyzeDOU()", () => {
    it("should analyze DOU publication content", async () => {
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({
          tipo_demanda: "renovacao_alvara",
          confidence: 0.95,
          urgente: false,
          resumo: "Renovação de alvará publicada no DOU",
        })
      );
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({
          cnpj: "12345678000191",
          alvara: "DPF/SP-2023-001",
          nova_validade: "2029-03-31",
        })
      );

      const { CognitiveEngine } = await import("../../src/lib/cognitive/engine");
      const engine = new CognitiveEngine({ autoFollowLinks: false });

      const result = await engine.analyzeDOU(
        "<article>RENOVAÇÃO DE ALVARÁ - CNPJ 12.345.678/0001-91</article>",
        "2026-03-31"
      );

      expect(result.classification.tipoDemanda).toBe("renovacao_alvara");
      expect(result.primaryContent.type).toBe("dou_publication");
      expect(result.primaryContent.source).toBe("dou_scraper");
      expect(result.primaryContent.metadata.date).toBe("2026-03-31");
    });
  });

  // ─── analyzeGespPage() ────────────────────────────────────────

  describe("analyzeGespPage()", () => {
    it("should analyze GESP portal page with company context", async () => {
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({
          tipo_demanda: "correcao_dados",
          confidence: 0.82,
          urgente: false,
          resumo: "Dados divergentes no GESP",
        })
      );
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({ campo_a_corrigir: "nome", valor_gesp: "JOAO", valor_correto: "JOÃO" })
      );

      const { CognitiveEngine } = await import("../../src/lib/cognitive/engine");
      const engine = new CognitiveEngine({ autoFollowLinks: false });

      const result = await engine.analyzeGespPage(
        "<html><body><h1>Portal GESP</h1><p>Vigilante: JOAO DA SILVA</p></body></html>",
        "https://servicos.dpf.gov.br/gesp/vigilante/123",
        "company_789"
      );

      expect(result.classification.tipoDemanda).toBe("correcao_dados");
      expect(result.primaryContent.type).toBe("gesp_page");
      expect(result.primaryContent.source).toBe("gesp_portal");
    });
  });

  // ─── Token tracking ───────────────────────────────────────────

  describe("token tracking", () => {
    it("should accumulate token usage across all AI calls", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify({ tipo_demanda: "novo_vigilante", confidence: 0.90, urgente: false, resumo: "test" }) }],
        usage: { input_tokens: 200, output_tokens: 50, cache_read_input_tokens: 150 },
      });
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify({ nome: "Test" }) }],
        usage: { input_tokens: 300, output_tokens: 100, cache_read_input_tokens: 200 },
      });

      const { CognitiveEngine } = await import("../../src/lib/cognitive/engine");
      const engine = new CognitiveEngine({ autoFollowLinks: false });

      const result = await engine.analyze("test", "email", "gmail", {
        subject: "Test",
        fromEmail: "a@b.com",
        bodyText: "test",
      });

      // Total: 200+300 input, 50+100 output, 150+200 cache
      expect(result.totalTokens.input).toBe(500);
      expect(result.totalTokens.output).toBe(150);
      expect(result.totalTokens.cacheRead).toBe(350);
    });

    it("should expose token usage via getTokenUsage()", async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: JSON.stringify({ tipo_demanda: "caso_desconhecido", confidence: 0.40, urgente: false, resumo: "?" }) }],
        usage: { input_tokens: 100, output_tokens: 30 },
      });
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: "text", text: "{}" }],
        usage: { input_tokens: 80, output_tokens: 20 },
      });

      const { CognitiveEngine } = await import("../../src/lib/cognitive/engine");
      const engine = new CognitiveEngine({ autoFollowLinks: false });

      await engine.analyze("test", "email", "gmail", {
        subject: "X",
        fromEmail: "a@b.com",
        bodyText: "test",
      });

      const usage = engine.getTokenUsage();
      expect(usage.totalInput).toBe(180);
      expect(usage.totalOutput).toBe(50);
    });
  });

  // ─── Workflow generation ──────────────────────────────────────

  describe("workflow generation", () => {
    it("should include R2 (save before) in all workflows", () => {
      // Pure unit test via WorkflowResolver — no AI mocking needed
      const resolver = new WorkflowResolver();
      const tipos: TipoDemanda[] = ["novo_vigilante", "compra_arma", "renovacao_cnv"];

      for (const tipo of tipos) {
        const { rules } = resolver.resolve(tipo, {}, false);
        expect(rules).toContain("R2");
      }
    });

    it("should generate escalation for caso_desconhecido with Template E", async () => {
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({
          tipo_demanda: "caso_desconhecido",
          confidence: 0.40,
          urgente: false,
          resumo: "Não identificado",
        })
      );
      mockAnthropicCreate.mockResolvedValueOnce(mockAIResponse({}));

      const { CognitiveEngine } = await import("../../src/lib/cognitive/engine");
      const engine = new CognitiveEngine({ autoFollowLinks: false });

      const result = await engine.analyze("?", "email", "gmail", {
        subject: "?",
        fromEmail: "a@b.com",
        bodyText: "?",
      });

      expect(result.requiresHumanApproval).toBe(true);
      const escalation = result.recommendedActions.find((a) => a.type === "escalate_human");
      expect(escalation).toBeDefined();
      expect(escalation?.template).toBe("E");
    });

    it("should generate correcao_dados with dual screenshots (R1)", async () => {
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({
          tipo_demanda: "correcao_dados",
          confidence: 0.85,
          urgente: false,
          resumo: "Correção de dados no GESP",
        })
      );
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({ campo: "nome", valor_correto: "JOÃO" })
      );

      const { CognitiveEngine } = await import("../../src/lib/cognitive/engine");
      const engine = new CognitiveEngine({ autoFollowLinks: false });

      const result = await engine.analyze("Correção de nome", "email", "gmail", {
        subject: "Correção de dados",
        fromEmail: "a@b.com",
        bodyText: "Correção de nome",
      });

      const screenshots = result.recommendedActions.filter((a) => a.type === "take_screenshot");
      expect(screenshots.length).toBe(2); // before + after (R1)
      expect(result.applicableRules).toContain("R1");
    });
  });

  // ─── CognitiveAnalysis structure validation ───────────────────

  describe("CognitiveAnalysis structure", () => {
    it("should return all required fields in the analysis", async () => {
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({
          tipo_demanda: "reciclagem",
          confidence: 0.80,
          urgente: false,
          resumo: "Reciclagem de vigilante",
        })
      );
      mockAnthropicCreate.mockResolvedValueOnce(
        mockAIResponse({ escola: "Centro Formação SP", data_curso: "2026-05-15" })
      );

      const { CognitiveEngine } = await import("../../src/lib/cognitive/engine");
      const engine = new CognitiveEngine({ autoFollowLinks: false });

      const result: CognitiveAnalysis = await engine.analyze("reciclagem", "email", "gmail", {
        subject: "Reciclagem",
        fromEmail: "a@b.com",
        bodyText: "reciclagem",
      });

      // Validate complete structure
      expect(result).toHaveProperty("analysisId");
      expect(result).toHaveProperty("primaryContent");
      expect(result).toHaveProperty("navigatedContents");
      expect(result).toHaveProperty("classification");
      expect(result).toHaveProperty("extractedData");
      expect(result).toHaveProperty("recommendedActions");
      expect(result).toHaveProperty("applicableRules");
      expect(result).toHaveProperty("requiresHumanApproval");
      expect(result).toHaveProperty("totalTokens");
      expect(result).toHaveProperty("processingTimeMs");

      // Validate classification structure
      expect(result.classification).toHaveProperty("tipoDemanda");
      expect(result.classification).toHaveProperty("confidence");
      expect(result.classification).toHaveProperty("urgente");
      expect(result.classification).toHaveProperty("resumo");
      expect(result.classification).toHaveProperty("reclassified");

      // Validate primaryContent is a proper ContentUnit
      expect(result.primaryContent).toHaveProperty("id");
      expect(result.primaryContent).toHaveProperty("type");
      expect(result.primaryContent).toHaveProperty("source");
      expect(result.primaryContent).toHaveProperty("rawText");
      expect(result.primaryContent).toHaveProperty("discoveredLinks");
      expect(result.primaryContent).toHaveProperty("discoveredAttachments");
      expect(result.primaryContent).toHaveProperty("depth");

      // Validate totalTokens structure
      expect(result.totalTokens).toHaveProperty("input");
      expect(result.totalTokens).toHaveProperty("output");
      expect(result.totalTokens).toHaveProperty("cacheRead");

      // Validate actions are well-formed
      for (const action of result.recommendedActions) {
        expect(action).toHaveProperty("id");
        expect(action).toHaveProperty("type");
        expect(action).toHaveProperty("description");
        expect(action).toHaveProperty("targetAgent");
        expect(action).toHaveProperty("priority");
        expect(action).toHaveProperty("payload");
        expect(action).toHaveProperty("dependsOn");
        expect(action).toHaveProperty("status");
        expect(action.status).toBe("pending");
      }
    });
  });
});

// ─── Integration Flow Tests (no API) ─────────────────────────────
describe("CognitiveEngine Integration (mocked)", () => {
  it("should have all modules exportable", async () => {
    // Import individual modules to avoid Supabase initialization from engine.ts → base.ts
    const { DocumentProcessor } = await import("../../src/lib/cognitive/document-processor");
    const { PageNavigator } = await import("../../src/lib/cognitive/page-navigator");
    const { WorkflowResolver } = await import("../../src/lib/cognitive/workflow-resolver");
    const { DEFAULT_COGNITIVE_CONFIG } = await import("../../src/lib/cognitive/types");

    expect(DocumentProcessor).toBeDefined();
    expect(PageNavigator).toBeDefined();
    expect(WorkflowResolver).toBeDefined();
    expect(DEFAULT_COGNITIVE_CONFIG).toBeDefined();
    expect(DEFAULT_COGNITIVE_CONFIG.confidenceThreshold).toBe(0.70);
    expect(DEFAULT_COGNITIVE_CONFIG.maxNavigationDepth).toBe(3);
  });

  it("should correctly map all ofício types to their workflows", () => {
    const resolver = new WorkflowResolver();
    const oficioMap: Record<string, string> = {
      novo_posto: "OF-A",
      compra_arma: "OF-B",
      venda_arma: "OF-B",
      transporte_equipamento: "OF-C",
      correcao_dados: "OF-D",
      encerramento_posto: "OF-E",
    };

    for (const [tipo, expectedOficio] of Object.entries(oficioMap)) {
      const def = resolver.getDefinition(tipo as TipoDemanda);
      expect(def?.templates).toContain(expectedOficio);
      expect(def?.generatesOficio).toBe(true);
    }
  });

  it("should identify GESP-requiring workflows", () => {
    const resolver = new WorkflowResolver();
    const gespWorkflows: TipoDemanda[] = [
      "novo_vigilante",
      "transferencia_posto",
      "correcao_dados",
    ];

    const nonGespWorkflows: TipoDemanda[] = [
      "novo_posto",
      "compra_arma",
      "renovacao_cnv",
      "caso_desconhecido",
    ];

    for (const tipo of gespWorkflows) {
      const def = resolver.getDefinition(tipo);
      expect(def?.requiresGesp).toBe(true);
    }

    for (const tipo of nonGespWorkflows) {
      const def = resolver.getDefinition(tipo);
      expect(def?.requiresGesp).toBe(false);
    }
  });

  it("should have correcao_dados workflow with dual screenshots (R1)", () => {
    const resolver = new WorkflowResolver();
    const def = resolver.getDefinition("correcao_dados");

    const screenshots = def?.steps.filter(
      (s) => s.actionType === "take_screenshot"
    );
    expect(screenshots?.length).toBe(2); // before and after
    expect(def?.rules).toContain("R1");
  });
});
