/**
 * VIGI CognitiveEngine — Captador Integration
 *
 * Versão cognitiva do processamento de emails que:
 * 1. Recebe email bruto
 * 2. Usa CognitiveEngine para análise profunda (navega links, abre PDFs)
 * 3. Retorna classificação + dados + workflow completo
 * 4. Integra com o pipeline existente do Captador
 *
 * Substitui a sequência classifyEmail() → extractData() por uma
 * análise holística que entende o contexto completo da demanda.
 */

import {
  startAgentRun,
  completeAgentRun,
  logAgentDecision,
} from "@/lib/agents/base";
import { CaptadorState } from "@/lib/agents/types";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { CognitiveEngine } from "./engine";
import type { CognitiveAnalysis, CognitiveEngineConfig } from "./types";

interface CognitiveCaptadorResult {
  state: CaptadorState;
  analysis: CognitiveAnalysis;
}

/**
 * Processa email usando CognitiveEngine em vez de classify + extract separados.
 * Drop-in replacement para runCaptadorEmail que entende contexto profundo.
 */
export async function runCognitiveCaptadorEmail(
  companyId: string,
  emailId: string,
  subject: string,
  bodyText: string,
  bodyHtml?: string,
  fromEmail?: string,
  attachments?: Array<{ name: string; url?: string; type?: string }>,
  config?: Partial<CognitiveEngineConfig>
): Promise<CognitiveCaptadorResult> {
  const supabase = createSupabaseAdmin();

  const state: CaptadorState = {
    agentName: "captador",
    runId: "",
    triggerType: "webhook",
    triggerSource: "cognitive_email_classification",
    startedAt: new Date().toISOString(),
    steps: [],
    runType: "cognitive_email",
    status: "pending",
    emailId,
    companyId,
    documentsProcessed: 0,
    matchesFound: 0,
    alertsGenerated: 0,
    errors: [],
    totalTokens: 0,
    totalCostUsd: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  let analysis: CognitiveAnalysis;

  try {
    // 1. Start agent run
    const startResult = (await startAgentRun({
      agent_name: "captador",
      run_type: "webhook",
      input_data: {
        email_id: emailId,
        company_id: companyId,
        subject,
        from_email: fromEmail,
        mode: "cognitive",
      },
    })) as { runId: string };

    state.runId = startResult.runId;

    // 2. CognitiveEngine analisa tudo de uma vez
    const engine = new CognitiveEngine({
      companyId,
      parentRunId: startResult.runId,
      ...config,
    });

    analysis = await engine.analyzeEmail(
      subject,
      bodyText,
      bodyHtml,
      fromEmail || "desconhecido",
      attachments,
      companyId
    );

    // 3. Log da classificação cognitiva
    await logAgentDecision({
      agent_name: "captador",
      agent_run_id: startResult.runId,
      decision_type: "cognitive_classification",
      input_data: {
        subject,
        from_email: fromEmail,
        body_length: bodyText.length,
        attachments_count: attachments?.length ?? 0,
        links_found: analysis.primaryContent.discoveredLinks.length,
        navigated_pages: analysis.navigatedContents.length,
      },
      output_data: {
        tipo_demanda: analysis.classification.tipoDemanda,
        confidence: analysis.classification.confidence,
        urgente: analysis.classification.urgente,
        reclassified: analysis.classification.reclassified,
        original_tipo: analysis.classification.originalTipoDemanda,
        original_confidence: analysis.classification.originalConfidence,
        workflow_actions: analysis.recommendedActions.length,
        applicable_rules: analysis.applicableRules,
      },
      model_used: "cognitive_engine",
      confidence: analysis.classification.confidence,
      reasoning: analysis.classification.resumo,
    });

    // 4. Atualizar state com resultados
    state.classification = {
      tipoDemanda: analysis.classification.tipoDemanda,
      confidence: analysis.classification.confidence,
      urgente: analysis.classification.urgente,
      resumo: analysis.classification.resumo,
    };
    state.extraction = analysis.extractedData;
    state.documentsProcessed = 1 + analysis.navigatedContents.length;
    state.matchesFound = analysis.extractedData.cnpj ? 1 : 0;
    state.totalTokens = analysis.totalTokens.input + analysis.totalTokens.output;
    state.cacheReadTokens = analysis.totalTokens.cacheRead;

    // 5. Criar workflow no banco
    const { data: workflow } = await supabase
      .from("email_workflows")
      .insert({
        company_id: companyId,
        email_id: emailId,
        classification_type: analysis.classification.tipoDemanda,
        classification_confidence: analysis.classification.confidence,
        extracted_data: analysis.extractedData,
        cognitive_analysis: {
          analysisId: analysis.analysisId,
          navigatedPages: analysis.navigatedContents.length,
          reclassified: analysis.classification.reclassified,
          processingTimeMs: analysis.processingTimeMs,
          applicableRules: analysis.applicableRules,
          totalTokens: analysis.totalTokens,
        },
        recommended_actions: analysis.recommendedActions.map((a) => ({
          type: a.type,
          description: a.description,
          targetAgent: a.targetAgent,
          template: a.template,
          prdRule: a.prdRule,
        })),
        status: analysis.requiresHumanApproval ? "needs_review" : "ready",
        urgente: analysis.classification.urgente,
      })
      .select("id")
      .single();

    if (workflow) {
      state.workflowId = workflow.id;
    }

    // 6. Se precisa aprovação humana → escalar (R7)
    if (analysis.requiresHumanApproval) {
      await supabase.from("escalations").insert({
        company_id: companyId,
        email_id: emailId,
        workflow_id: workflow?.id,
        reason: analysis.escalationReason,
        tipo_demanda: analysis.classification.tipoDemanda,
        confidence: analysis.classification.confidence,
        extracted_data: analysis.extractedData,
        status: "pending",
      });
    }

    state.status = "completed";
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[CognitiveCaptador] Error:", errorMsg);
    state.status = "failed";
    state.errors.push(`[cognitive] ${errorMsg}`);

    // Fallback analysis for return
    analysis = {
      analysisId: "error",
      primaryContent: {} as CognitiveAnalysis["primaryContent"],
      navigatedContents: [],
      classification: {
        tipoDemanda: "caso_desconhecido",
        confidence: 0,
        urgente: false,
        resumo: errorMsg,
        reclassified: false,
      },
      extractedData: {},
      recommendedActions: [],
      applicableRules: ["R7"],
      requiresHumanApproval: true,
      escalationReason: `Cognitive engine error: ${errorMsg}`,
      totalTokens: { input: 0, output: 0, cacheRead: 0 },
      processingTimeMs: 0,
    };
  } finally {
    if (state.runId) {
      await completeAgentRun({
        runId: state.runId,
        status: (state.status || "failed") as "completed" | "failed",
        output_data: {
          tipo_demanda: analysis!.classification.tipoDemanda,
          confidence: analysis!.classification.confidence,
          urgente: analysis!.classification.urgente,
          documentsProcessed: state.documentsProcessed,
          navigatedPages: analysis!.navigatedContents.length,
          reclassified: analysis!.classification.reclassified,
          workflowActions: analysis!.recommendedActions.length,
          processingTimeMs: analysis!.processingTimeMs,
        },
      });
    }
  }

  return { state, analysis };
}

/**
 * Processa publicação DOU usando CognitiveEngine.
 * Entende o contexto completo de cada publicação, navegando links se necessário.
 */
export async function runCognitiveCaptadorDOU(
  html: string,
  date: string,
  config?: Partial<CognitiveEngineConfig>
): Promise<CognitiveAnalysis> {
  const engine = new CognitiveEngine({
    maxNavigationDepth: 2, // DOU geralmente não tem links profundos
    maxLinksPerPage: 3,
    autoFollowLinks: true,
    ...config,
  });

  return engine.analyzeDOU(html, date);
}
