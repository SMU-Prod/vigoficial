/**
 * VIGI CognitiveEngine — Core Module
 *
 * Cérebro central que interpreta conteúdo (emails, páginas, PDFs),
 * navega links/botões autonomamente, classifica demandas, e monta
 * o workflow correto seguindo o PRD.
 *
 * Fluxo:
 * 1. Recebe conteúdo bruto (email, HTML, PDF)
 * 2. Extrai links, botões, anexos
 * 3. Classifica tipo de demanda
 * 4. Decide quais links/anexos navegar para completar entendimento
 * 5. Reclassifica se necessário (com mais contexto)
 * 6. Extrai dados estruturados consolidados
 * 7. Monta workflow de ações conforme PRD
 * 8. Retorna CognitiveAnalysis completa
 */

import { getAnthropicClient, AI_MODELS, AI_THRESHOLDS } from "@/lib/ai/client";
import {
  EXTRACTOR_SYSTEM_PROMPT,
  EXTRACTION_PROMPTS,
} from "@/lib/ai/prompts";
// TD-05 FIX: Import from core to break circular dependency with agents
import { TokenTracker } from "@/lib/core/token-tracker";
import { DocumentProcessor } from "./document-processor";
import { PageNavigator } from "./page-navigator";
import { WorkflowResolver } from "./workflow-resolver";
import {
  ContentUnit,
  ContentType,
  ContentSource,
  CognitiveAnalysis,
  CognitiveClassification,
  CognitiveEngineConfig,
  DEFAULT_COGNITIVE_CONFIG,
  NavigationDecision,
  TipoDemanda,
} from "./types";

// ─── PRD Context (cached for 5min via prompt caching) ────────────
const PRD_CONTEXT_PROMPT = `Você é o CognitiveEngine do VIG PRO, sistema de compliance para empresas de segurança privada brasileiras.
Seu papel é ENTENDER o contexto completo de uma demanda, analisando TODO conteúdo disponível.

REGRAS FUNDAMENTAIS (PRD Seção 6):
R1: NUNCA abreviar nomes. Se GESP mostra dado diferente do email → OF-D (Divergência) com 2 screenshots.
R2: Salvar email no banco ANTES de processar.
R3: Gating de faturamento — só processa empresas com billing ativo. Exceção: alertas de CNV/alvará continuam.
R4: Batch máximo 999 vigilantes por submissão GESP.
R5: Lock: máximo 1 sessão GESP por empresa, 3 browsers no total.
R6: GESP offline → retry a cada 3min, mantém fila.
R7: Confidence < 0.70 → caso_desconhecido → escala humano (Template E para equipe@vigi.com.br).
R8: Template B de confirmação obrigatório após TODA ação executada.
R9: Parar alertas quando renovação detectada no DOU → alertas_ativos[campo] = false.
R10: "URGENTE/URGÊNCIA/PRAZO HOJE/AUTUAÇÃO/IMEDIATO" → ciclo imediato, não esperar cron.
R11: PF = texto puro, remetente da empresa. Cliente = HTML com branding VIG PRO.
R12: Ofício vai para DELESP do estado do POSTO, não da sede.

TIPOS DE DEMANDA (PRD Seção 9):
1. novo_vigilante — Cadastro no GESP + envio Template B
2. novo_posto — Criar processo + OF-A para DELESP + Template B
3. compra_arma — Registrar + OF-B para DELESP + Template B
4. venda_arma — Registrar saída + OF-B + Template B
5. transporte_equipamento — OF-C para DELESP + Template B
6. encerramento_posto — OF-E para DELESP + Template B
7. transferencia_posto — Atualizar GESP + Template B
8. renovacao_cnv — Verificar DOU + alertas cascade + Template B
9. compra_colete — Registrar + Template B
10. baixa_colete — Registrar baixa + Template B
11. correcao_dados — Verificar GESP vs email (possível R1 divergência) + Template B
12. manutencao_veiculo — Registrar + Template G se threshold
13. reciclagem — Registrar escola/data + Template B
14. renovacao_alvara — Verificar DOU + alertas + Template B
15. caso_desconhecido — Template E → equipe humana

CAPACIDADES DE NAVEGAÇÃO:
- Você pode pedir para seguir links em emails/páginas
- Você pode pedir para abrir PDFs anexos
- Você pode pedir para interagir com formulários GESP
- Cada nível de profundidade traz mais contexto para sua análise
- Máximo de profundidade configurável (padrão: 3 níveis)

Responda SEMPRE em JSON válido conforme solicitado.`;

// ─── Navigation Decision Prompt ──────────────────────────────────
const NAVIGATION_DECISION_PROMPT = `Analise os links/botões/anexos encontrados neste conteúdo.
Para cada um, decida se deve ser navegado para completar o entendimento da demanda.

CRITÉRIOS PARA NAVEGAR:
- Link contém informação relevante para classificar ou extrair dados
- PDF pode conter documentos oficiais, CNVs, alvarás, etc.
- Botão leva a mais detalhes sobre a demanda
- Link para sistema GESP/GOV.BR pode ter dados adicionais

CRITÉRIOS PARA NÃO NAVEGAR:
- Link é publicidade, footer, termos de uso
- PDF é template genérico ou manual
- Link já foi visitado (por parentId)
- Profundidade atual já atingiu o máximo

Retorne JSON: { "decisions": [{"index": 0, "shouldNavigate": true/false, "reason": "...", "priority": 1-10}] }`;

// FIX: IA-05 — Cost budget constants
const COST_BUDGET_THRESHOLD_USD = 0.50; // Max cost per analysis

export class CognitiveEngine {
  private config: CognitiveEngineConfig;
  private tokenTracker: TokenTracker;
  private documentProcessor: DocumentProcessor;
  private pageNavigator: PageNavigator;
  private workflowResolver: WorkflowResolver;
  private processedUrls: Set<string> = new Set();

  constructor(config: Partial<CognitiveEngineConfig> = {}) {
    this.config = { ...DEFAULT_COGNITIVE_CONFIG, ...config };
    this.tokenTracker = new TokenTracker("cognitive-engine");
    this.documentProcessor = new DocumentProcessor();
    this.pageNavigator = new PageNavigator(this.config.fetchTimeoutMs);
    this.workflowResolver = new WorkflowResolver();
  }

  /**
   * Ponto de entrada principal — analisa qualquer conteúdo e retorna
   * a análise cognitiva completa com workflow recomendado.
   */
  async analyze(
    rawContent: string,
    contentType: ContentType,
    source: ContentSource,
    metadata: Record<string, unknown> = {}
  ): Promise<CognitiveAnalysis> {
    const startTime = Date.now();
    const analysisId = `cog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 1. Processar conteúdo primário → ContentUnit
    const primaryContent = await this.documentProcessor.process(
      rawContent,
      contentType,
      source,
      metadata,
      0 // depth 0
    );

    // 2. Classificação inicial
    let classification = await this.classify(primaryContent);

    // 3. Decidir navegação de links/anexos
    // FIX: IA-05 — Check cost budget before navigation
    const navigatedContents: ContentUnit[] = [];
    const currentCost = this.tokenTracker.cost;

    if (
      this.config.autoFollowLinks &&
      (primaryContent.discoveredLinks.length > 0 ||
        primaryContent.discoveredAttachments.length > 0) &&
      currentCost < COST_BUDGET_THRESHOLD_USD // Budget check
    ) {
      const navResults = await this.navigateRelevant(
        primaryContent,
        classification
      );
      navigatedContents.push(...navResults);
    } else if (currentCost >= COST_BUDGET_THRESHOLD_USD) {
      // Budget exceeded - halt navigation
      console.warn(`[CognitiveEngine] Cost budget exceeded: $${currentCost.toFixed(4)} >= $${COST_BUDGET_THRESHOLD_USD}. Halting link navigation.`);
    }

    // 4. Reclassificar se navegamos conteúdo adicional
    if (navigatedContents.length > 0) {
      const enrichedClassification = await this.reclassify(
        primaryContent,
        navigatedContents,
        classification
      );

      if (enrichedClassification.confidence > classification.confidence) {
        enrichedClassification.reclassified = true;
        enrichedClassification.originalTipoDemanda = classification.tipoDemanda;
        enrichedClassification.originalConfidence = classification.confidence;
        classification = enrichedClassification;
      }
    }

    // 5. Extrair dados consolidados de TODAS as fontes
    const allContents = [primaryContent, ...navigatedContents];
    const extractedData = await this.extractConsolidated(
      classification.tipoDemanda,
      allContents
    );

    // 6. Resolver workflow correto conforme PRD
    const { actions, rules } = this.workflowResolver.resolve(
      classification.tipoDemanda,
      extractedData,
      classification.urgente,
      this.config.companyId
    );

    // 7. Verificar se precisa aprovação humana
    const requiresHumanApproval =
      classification.confidence < this.config.confidenceThreshold ||
      classification.tipoDemanda === "caso_desconhecido";

    const escalationReason = requiresHumanApproval
      ? classification.tipoDemanda === "caso_desconhecido"
        ? `Demanda não reconhecida (confidence: ${classification.confidence.toFixed(2)}). Regra R7 — escalando para equipe humana.`
        : `Confidence ${classification.confidence.toFixed(2)} abaixo do threshold ${this.config.confidenceThreshold}. Regra R7.`
      : undefined;

    return {
      analysisId,
      primaryContent,
      navigatedContents,
      classification,
      extractedData,
      recommendedActions: actions,
      applicableRules: rules,
      requiresHumanApproval,
      escalationReason,
      totalTokens: {
        input: this.tokenTracker.totalInputTokens,
        output: this.tokenTracker.totalOutputTokens,
        cacheRead: this.tokenTracker.cacheReadTokens,
      },
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Atalho para analisar email (caso mais comum)
   */
  async analyzeEmail(
    subject: string,
    bodyText: string,
    bodyHtml: string | undefined,
    fromEmail: string,
    attachments: Array<{ name: string; url?: string; type?: string }> = [],
    companyId?: string
  ): Promise<CognitiveAnalysis> {
    if (companyId) {
      this.config.companyId = companyId;
    }

    const rawContent = bodyHtml || bodyText;
    const metadata = {
      subject,
      fromEmail,
      bodyText,
      bodyHtml,
      attachmentCount: attachments.length,
      attachments,
    };

    return this.analyze(rawContent, "email", "gmail", metadata);
  }

  /**
   * Atalho para analisar publicação DOU
   */
  async analyzeDOU(html: string, date: string): Promise<CognitiveAnalysis> {
    return this.analyze(html, "dou_publication", "dou_scraper", { date });
  }

  /**
   * Atalho para analisar página GESP
   */
  async analyzeGespPage(
    html: string,
    pageUrl: string,
    companyId: string
  ): Promise<CognitiveAnalysis> {
    this.config.companyId = companyId;
    return this.analyze(html, "gesp_page", "gesp_portal", {
      url: pageUrl,
      companyId,
    });
  }

  // ─── Internal Methods ──────────────────────────────────────────

  /**
   * Classifica o conteúdo usando Claude Haiku com PRD como contexto.
   */
  private async classify(content: ContentUnit): Promise<CognitiveClassification> {
    const anthropic = getAnthropicClient();

    const userContent = this.buildClassificationPrompt(content);

    const response = await anthropic.messages.create({
      model: AI_MODELS.fast,
      max_tokens: AI_THRESHOLDS.classificationMaxTokens,
      system: [
        {
          type: "text",
          text: PRD_CONTEXT_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userContent }],
    });

    // FIX: IA-04 — Record token usage from Claude API response
    this.tokenTracker.track(response.usage);

    try {
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const parsed = JSON.parse(text);

      // R7: threshold check
      const tipoDemanda: TipoDemanda =
        parsed.confidence < this.config.confidenceThreshold
          ? "caso_desconhecido"
          : (parsed.tipo_demanda as TipoDemanda) || "caso_desconhecido";

      return {
        tipoDemanda,
        confidence: parsed.confidence || 0,
        urgente: parsed.urgente || false,
        resumo: parsed.resumo || "",
        reclassified: false,
      };
    } catch {
      return {
        tipoDemanda: "caso_desconhecido",
        confidence: 0,
        urgente: false,
        resumo: "Falha ao parsear resposta do classificador",
        reclassified: false,
      };
    }
  }

  /**
   * Reclassifica após navegar conteúdo adicional.
   * Combina informação de todas as fontes para uma classificação mais precisa.
   */
  private async reclassify(
    primary: ContentUnit,
    navigated: ContentUnit[],
    originalClassification: CognitiveClassification
  ): Promise<CognitiveClassification> {
    const anthropic = getAnthropicClient();

    const combinedContext = [
      `CONTEÚDO PRIMÁRIO (${primary.type}):`,
      primary.rawText.slice(0, 2000),
      "",
      ...navigated.map(
        (n, i) =>
          `CONTEÚDO NAVEGADO ${i + 1} (${n.type}, depth=${n.depth}):\n${n.rawText.slice(0, 1000)}`
      ),
      "",
      `CLASSIFICAÇÃO ANTERIOR: ${originalClassification.tipoDemanda} (confidence: ${originalClassification.confidence})`,
      "",
      "Com base em TODO o contexto acima, reclassifique a demanda.",
      'Responda JSON: {"tipo_demanda": "...", "confidence": 0.00, "urgente": false, "resumo": "..."}',
    ].join("\n");

    const response = await anthropic.messages.create({
      model: AI_MODELS.complex, // Sonnet para reclassificação (mais contexto)
      max_tokens: AI_THRESHOLDS.classificationMaxTokens,
      system: [
        {
          type: "text",
          text: PRD_CONTEXT_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: combinedContext }],
    });

    this.tokenTracker.track(response.usage);

    try {
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const parsed = JSON.parse(text);

      const tipoDemanda: TipoDemanda =
        parsed.confidence < this.config.confidenceThreshold
          ? "caso_desconhecido"
          : (parsed.tipo_demanda as TipoDemanda) || "caso_desconhecido";

      return {
        tipoDemanda,
        confidence: parsed.confidence || 0,
        urgente: parsed.urgente || originalClassification.urgente,
        resumo: parsed.resumo || originalClassification.resumo,
        reclassified: false, // será setado pelo caller se confidence for maior
      };
    } catch {
      return originalClassification;
    }
  }

  /**
   * Decide quais links/anexos navegar e os processa.
   */
  private async navigateRelevant(
    content: ContentUnit,
    classification: CognitiveClassification
  ): Promise<ContentUnit[]> {
    if (content.depth >= this.config.maxNavigationDepth) return [];

    const decisions = await this.decideNavigation(content, classification);
    const toNavigate = decisions
      .filter((d) => d.shouldNavigate)
      .sort((a, b) => a.priority - b.priority)
      .slice(0, this.config.maxLinksPerPage);

    const results: ContentUnit[] = [];

    for (const decision of toNavigate) {
      try {
        const target = decision.target;
        const url = "url" in target ? target.url : undefined;
        if (!url || this.processedUrls.has(url)) continue;

        this.processedUrls.add(url);

        const fetchedContent = await this.pageNavigator.fetch(url);
        if (!fetchedContent) continue;

        const contentType: ContentType =
          "type" in target && target.type === "pdf" ? "pdf" : "html_page";

        const processed = await this.documentProcessor.process(
          fetchedContent,
          contentType,
          "url_fetch",
          { url, parentId: content.id },
          content.depth + 1,
          content.id
        );

        results.push(processed);

        // Recursivamente navegar sub-links se ainda dentro do depth limit
        if (
          processed.depth < this.config.maxNavigationDepth &&
          processed.discoveredLinks.length > 0
        ) {
          const subResults = await this.navigateRelevant(
            processed,
            classification
          );
          results.push(...subResults);
        }
      } catch (err) {
        // Silently skip failed navigation — don't break the analysis
        console.warn("[CognitiveEngine] Navigation failed:", err);
      }
    }

    return results;
  }

  /**
   * Usa IA para decidir quais links/anexos seguir.
   */
  private async decideNavigation(
    content: ContentUnit,
    classification: CognitiveClassification
  ): Promise<NavigationDecision[]> {
    if (
      content.discoveredLinks.length === 0 &&
      content.discoveredAttachments.length === 0
    ) {
      return [];
    }

    const anthropic = getAnthropicClient();

    const linksDesc = content.discoveredLinks
      .map((l, i) => `[${i}] ${l.type}: "${l.text}" → ${l.url}`)
      .join("\n");

    const attachDesc = content.discoveredAttachments
      .map(
        (a, i) =>
          `[ATT-${i}] ${a.type}: "${a.name}" ${a.url ? `→ ${a.url}` : "(inline)"}`
      )
      .join("\n");

    const userContent = `CONTEÚDO ATUAL (${content.type}, depth=${content.depth}):
${content.rawText.slice(0, 1500)}

CLASSIFICAÇÃO ATUAL: ${classification.tipoDemanda} (confidence: ${classification.confidence})

LINKS ENCONTRADOS:
${linksDesc || "Nenhum"}

ANEXOS ENCONTRADOS:
${attachDesc || "Nenhum"}

${NAVIGATION_DECISION_PROMPT}`;

    const response = await anthropic.messages.create({
      model: AI_MODELS.fast, // Haiku para decisão rápida
      max_tokens: 500,
      system: [
        {
          type: "text",
          text: PRD_CONTEXT_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userContent }],
    });

    this.tokenTracker.track(response.usage);

    try {
      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const parsed = JSON.parse(text);

      return (parsed.decisions || []).map((d: Record<string, unknown>) => {
        const idx = d.index as number;
        const isAttachment =
          typeof d.index === "string" && String(d.index).startsWith("ATT-");
        const target = isAttachment
          ? content.discoveredAttachments[idx]
          : content.discoveredLinks[idx];

        return {
          target: target || content.discoveredLinks[0],
          shouldNavigate: d.shouldNavigate as boolean,
          reason: (d.reason as string) || "",
          priority: (d.priority as number) || 5,
          maxDepthFromHere: this.config.maxNavigationDepth - content.depth,
        };
      });
    } catch {
      // Fallback: navegar PDFs automaticamente, ignorar o resto
      return content.discoveredAttachments
        .filter((a) => a.type === "pdf" && a.url)
        .map((a) => ({
          target: a,
          shouldNavigate: true,
          reason: "PDF attachment — auto-navigate",
          priority: 1,
          maxDepthFromHere: 1,
        }));
    }
  }

  /**
   * Extrai dados consolidados de todas as fontes usando o prompt correto.
   */
  private async extractConsolidated(
    tipoDemanda: TipoDemanda,
    allContents: ContentUnit[]
  ): Promise<Record<string, unknown>> {
    const extractionPrompt = EXTRACTION_PROMPTS[tipoDemanda];
    if (!extractionPrompt) {
      return { tipo_demanda: tipoDemanda, note: "No extraction prompt available" };
    }

    const anthropic = getAnthropicClient();

    // Combina texto de todas as fontes
    const combinedText = allContents
      .map((c) => {
        const header = c.depth === 0 ? "CONTEÚDO PRINCIPAL" : `FONTE ADICIONAL (depth=${c.depth})`;
        return `--- ${header} (${c.type}) ---\n${c.rawText.slice(0, 2000)}`;
      })
      .join("\n\n");

    const response = await anthropic.messages.create({
      model: AI_MODELS.complex, // Sonnet para extração
      max_tokens: AI_THRESHOLDS.extractionMaxTokens,
      system: [
        {
          type: "text",
          text: EXTRACTOR_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `TIPO DE DEMANDA: ${tipoDemanda}

INSTRUÇÕES DE EXTRAÇÃO:
${extractionPrompt}

${combinedText}`,
        },
      ],
    });

    this.tokenTracker.track(response.usage);

    try {
      const text = response.content[0].type === "text" ? response.content[0].text : "{}";
      return JSON.parse(text);
    } catch {
      return {
        erro: "Falha na extração consolidada",
        tipo_demanda: tipoDemanda,
        sourcesCount: allContents.length,
      };
    }
  }

  /**
   * Monta o prompt de classificação a partir do ContentUnit.
   */
  private buildClassificationPrompt(content: ContentUnit): string {
    const parts: string[] = [];

    if (content.type === "email") {
      const meta = content.metadata;
      parts.push(`EMAIL:`);
      parts.push(`De: ${meta.fromEmail || "desconhecido"}`);
      parts.push(`Assunto: ${meta.subject || "(sem assunto)"}`);
      parts.push(`Corpo: ${content.rawText.slice(0, 2000)}`);
      if ((meta.attachmentCount as number) > 0) {
        parts.push(`Anexos: ${meta.attachmentCount} arquivo(s)`);
      }
    } else if (content.type === "dou_publication") {
      parts.push(`PUBLICAÇÃO DOU (${content.metadata.date || "hoje"}):`);
      parts.push(content.rawText.slice(0, 3000));
    } else {
      parts.push(`CONTEÚDO (${content.type}):`);
      parts.push(content.rawText.slice(0, 2000));
    }

    if (content.discoveredLinks.length > 0) {
      parts.push(`\nLINKS ENCONTRADOS: ${content.discoveredLinks.length}`);
      content.discoveredLinks.slice(0, 5).forEach((l) => {
        parts.push(`- [${l.type}] ${l.text}: ${l.url}`);
      });
    }

    if (content.discoveredAttachments.length > 0) {
      parts.push(`\nANEXOS: ${content.discoveredAttachments.length}`);
      content.discoveredAttachments.forEach((a) => {
        parts.push(`- [${a.type}] ${a.name}`);
      });
    }

    parts.push(
      `\nClassifique esta demanda. Responda JSON: {"tipo_demanda": "...", "confidence": 0.00, "urgente": false, "resumo": "..."}`
    );

    return parts.join("\n");
  }

  /**
   * Retorna métricas de uso de tokens.
   */
  getTokenUsage() {
    return {
      totalInput: this.tokenTracker.totalInputTokens,
      totalOutput: this.tokenTracker.totalOutputTokens,
      cacheRead: this.tokenTracker.cacheReadTokens,
      estimatedCost: this.tokenTracker.totalInputTokens * 0.000001 +
        this.tokenTracker.totalOutputTokens * 0.000005,
    };
  }
}
