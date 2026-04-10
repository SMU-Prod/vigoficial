/**
 * VIGI — Agente Operacional
 * PRD Seção 3.5 (GESP) + 3.7 (Compliance) + 3.4 (Workflows)
 *
 * Responsabilidades:
 * - Executar sync GESP por empresa (Playwright/Firefox + certificado A1)
 * - Rodar motor de validades (CNV, alvará, reciclagem, coletes, porte, veículos)
 * - Processar workflows originados de emails classificados
 * - Human-in-the-loop para operações críticas
 * - Regra R3: Billing gating (não executa se billing inativo, exceto CNV/alvará)
 * - Regra R5: Max 1 sessão GESP por empresa, 3 total
 * - Regra R9: Para alertas quando validade renovada (>90 dias)
 *
 * Imports:
 * - @/lib/agents/base — startAgentRun, completeAgentRun, logAgentDecision, TokenTracker
 * - @/lib/agents/types — OperacionalState, ComplianceCheckResult
 * - @/lib/supabase/server — createSupabaseAdmin
 * - @/lib/gesp/sync — syncEmpresa
 * - @/lib/compliance/engine — checkComplianceEmpresa
 * - @/lib/security/billing-gate — isOperationAllowed
 * - @/lib/queue/jobs — addEmailSendJob, addGespSyncJob
 * - @/lib/config/constants — ALERT_THRESHOLDS, EMAIL_EQUIPE
 */

import {
  startAgentRun,
  completeAgentRun,
  logAgentDecision,
  TokenTracker,
  createStep,
  startStep,
  completeStep,
  failStep,
} from "@/lib/agents/base";
import type { OperacionalState, TriggerType } from "@/lib/agents/types";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { syncEmpresa } from "@/lib/gesp/sync";
import { runComplianceCheck } from "@/lib/compliance/engine";
import { isOperationAllowed, checkBillingGate } from "@/lib/security/billing-gate";
import { addEmailSendJob, addGespSyncJob } from "@/lib/queue/jobs";
import { EMAIL_EQUIPE } from "@/lib/config/constants";
import { getGespProcess } from "@/lib/gesp/knowledge-base"; // GESP KB

// ────────────────────────────────────────────────────────────────────
// HELPER: Initialize Operacional State
// ────────────────────────────────────────────────────────────────────

function initializeOperacionalState(
  runId: string,
  companyId: string,
  triggerType: string,
  triggerSource: string
): OperacionalState {
  return {
    runId,
    agentName: "operacional",
    companyId,
    triggerType: triggerType as TriggerType,
    triggerSource,
    startedAt: new Date().toISOString(),
    steps: [],
    errors: [],
    totalTokens: 0,
    totalCostUsd: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,

    // Operacional-specific fields
    gespSessionId: undefined,
    gespTasksTotal: 0,
    gespTasksCompleted: 0,
    gespTasksFailed: 0,
    gespScreenshots: [],
    complianceChecks: [],
    alertsSent: 0,
    alertsStopped: 0,
    workflowId: undefined,
    tipoDemanda: undefined,
    dadosExtraidos: undefined,
    needsHumanApproval: false,
    humanApprovalReason: undefined,
  };
}

// ────────────────────────────────────────────────────────────────────
// MAIN: runOperacionalGESP
// ────────────────────────────────────────────────────────────────────

/**
 * Executa sincronização GESP para uma empresa
 * - Verifica billing (R3)
 * - Chama syncEmpresa() para automação com Playwright/Firefox
 * - Registra resultados e screenshots
 * - Completa o run
 *
 * @param companyId ID da empresa
 * @param motivo Motivo da execução (manual, cron, workflow, etc.)
 * @returns OperacionalState com status final
 */
export async function runOperacionalGESP(
  companyId: string,
  motivo: string
): Promise<OperacionalState> {
  const supabase = createSupabaseAdmin();
  const tokenTracker = new TokenTracker();

  // STEP 1: Start agent run
  const runId = (await startAgentRun(
    "operacional",
    "manual",
    `gesp-sync:${motivo}`,
    companyId,
    { motivo }
  )) as string;

  const state = initializeOperacionalState(runId, companyId, "manual", `gesp-sync:${motivo}`);

  try {
    // STEP 2: Billing Gate Check (R3)
    let step = startStep(createStep("billing-gate-check"));
    state.steps.push(step);

    const billingGate = await checkBillingGate(companyId);
    if (!billingGate.allowed) {
      step = failStep(step, `Billing gate failed: ${billingGate.reason || billingGate.status}`);
      state.steps[state.steps.length - 1] = step;
      state.errors.push(`Operação suspensa por billing: ${billingGate.status}` as string);

      await logAgentDecision({
        run_id: runId,
        agent_name: "operacional",
        step_name: "billing-gate-check",
        decision_type: "action",
        input_summary: `Verificar billing para empresa ${companyId}`,
        output_summary: `Billing gate DENIED: ${billingGate.status}`,
        confidence: 1.0,
        escalated_to_human: true,
        tokens_input: 0,
        tokens_output: 0,
      });

      throw new Error(`GESP bloqueado: billing ${billingGate.status}`);
    }

    step = completeStep(step, { billingStatus: billingGate.status });
    state.steps[state.steps.length - 1] = step;

    // STEP 3: Fetch company data
    step = startStep(createStep("fetch-company"));
    state.steps.push(step);

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      step = failStep(step, `Empresa não encontrada: ${companyError?.message || "unknown"}`);
      state.steps[state.steps.length - 1] = step;
      throw new Error(`Empresa ${companyId} não encontrada`);
    }

    step = completeStep(step, { company: company.razao_social, cnpj: company.cnpj });
    state.steps[state.steps.length - 1] = step;

    // STEP 3.5: Knowledge-Base pre-check — validate pending gesp_tasks
    // Log pending tasks and flag any unmapped/unknown process types
    {
      const supabase = createSupabaseAdmin();
      const { data: pendingTasks } = await supabase
        .from("gesp_tasks")
        .select("id, tipo_acao, payload")
        .eq("company_id", companyId)
        .in("status", ["pendente", "retry"])
        .limit(50);

      if (pendingTasks && pendingTasks.length > 0) {
        const unknownTasks = pendingTasks.filter((t) => {
          const typeMap: Record<string, string> = {
            "cadastrar_vigilante": "cadastro_vigilante",
            "criar_processo_autorizativo": "autorizacao_funcionamento",
            "comunicar_ocorrencia": "comunicar_ocorrencia",
            "guia_transporte": "guia_transporte",
            "alterar_dados_empresa": "alteracao_dados",
            "cadastrar_arma": "autorizacao_armas",
            "cadastrar_colete": "autorizacao_coletes",
            "cadastrar_veiculo": "autorizacao_veiculos",
            "turma_formacao": "turmas_formacao",
            "instrutor_credenciamento": "credenciamento_instrutores",
          };
          const mapped = typeMap[t.tipo_acao] ?? t.tipo_acao;
          return !getGespProcess(mapped);
        });

        if (unknownTasks.length > 0) {
          state.errors.push(
            `KB-WARN: ${unknownTasks.length} tasks com tipo_acao não mapeado no knowledge-base: ` +
            unknownTasks.map((t) => t.tipo_acao).join(", ")
          );
        }
      }
    }

    // STEP 4: Call syncEmpresa (R5 lock and automation happens here)
    step = startStep(createStep("gesp-sync"));
    state.steps.push(step);

    let syncResult;
    try {
      syncResult = await syncEmpresa(companyId);
      state.gespSessionId = `GESP-${Date.now()}`;
      state.gespTasksCompleted = syncResult.tasks_executed || 0;
      state.gespScreenshots = []; // R2 paths are embedded in gesp_tasks
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      step = failStep(step, errorMsg);
      state.steps[state.steps.length - 1] = step;
      state.errors.push(`Erro na sincronização GESP: ${errorMsg}`);
      throw err;
    }

    step = completeStep(step, {
      tasksExecuted: state.gespTasksCompleted,
      session: state.gespSessionId,
    });
    state.steps[state.steps.length - 1] = step;

    // STEP 5: Log decision
    await logAgentDecision({
      run_id: runId,
      agent_name: "operacional",
      step_name: "gesp-sync",
      decision_type: "action",
      input_summary: `GESP sync para empresa ${companyId}`,
      output_summary: `Sincronização concluída: ${state.gespTasksCompleted} tarefas executadas`,
      confidence: 1.0,
      escalated_to_human: false,
      tokens_input: 0,
      tokens_output: 0,
    });

    // STEP 6: Complete run with success
    state.totalTokens = tokenTracker.total;
    state.totalCostUsd = tokenTracker.cost;
    state.cacheReadTokens = tokenTracker.stats.cacheRead;
    state.cacheWriteTokens = tokenTracker.stats.cacheWrite;

    const stats = tokenTracker.stats;
    stats.steps = state.steps.length;

    await completeAgentRun(runId, "operacional", "completed", state as Record<string, unknown>, stats);

    return state;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    state.errors.push(errorMsg as string);

    state.totalTokens = tokenTracker.total;
    state.totalCostUsd = tokenTracker.cost;
    state.cacheReadTokens = tokenTracker.stats.cacheRead;
    state.cacheWriteTokens = tokenTracker.stats.cacheWrite;

    const stats = tokenTracker.stats;
    stats.steps = state.steps.length;

    await completeAgentRun(runId, "operacional", "failed", state as Record<string, unknown>, stats, errorMsg);

    return state;
  }
}

// ────────────────────────────────────────────────────────────────────
// MAIN: runOperacionalCompliance
// ────────────────────────────────────────────────────────────────────

/**
 * Executa ciclo completo de compliance (validação de documentos)
 * - Verifica billing (R3), COM EXCEÇÃO para CNV e alvará
 * - Chama checkComplianceEmpresa() do motor de validades
 * - Registra alertas enviados e parados
 * - Completa o run
 *
 * @param companyId ID da empresa
 * @returns OperacionalState com status final
 */
export async function runOperacionalCompliance(companyId: string): Promise<OperacionalState> {
  const supabase = createSupabaseAdmin();
  const tokenTracker = new TokenTracker();

  // STEP 1: Start agent run
  const runId = (await startAgentRun(
    "operacional",
    "cron",
    "compliance-check",
    companyId,
    { companyId }
  )) as string;

  const state = initializeOperacionalState(runId, companyId, "cron", "compliance-check");

  try {
    // STEP 2: Billing Gate Check (R3) with legal exceptions
    let step = startStep(createStep("billing-gate-check"));
    state.steps.push(step);

    // Para compliance, CNV e alvará são SEMPRE checados (exceção legal)
    // Outros documentos só são checados se billing estiver ativo
    const billingGate = await checkBillingGate(companyId);
    const _billingAtivo = billingGate.allowed;

    step = completeStep(step, {
      billingStatus: billingGate.status,
      willProceed: true, // Sempre procede (exceção legal para CNV/alvará)
    });
    state.steps[state.steps.length - 1] = step;

    // STEP 3: Fetch company data
    step = startStep(createStep("fetch-company"));
    state.steps.push(step);

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      step = failStep(step, `Empresa não encontrada: ${companyError?.message || "unknown"}`);
      state.steps[state.steps.length - 1] = step;
      throw new Error(`Empresa ${companyId} não encontrada`);
    }

    step = completeStep(step, { company: company.razao_social });
    state.steps[state.steps.length - 1] = step;

    // STEP 4: Run compliance check
    step = startStep(createStep("compliance-check"));
    state.steps.push(step);

    let complianceResult;
    try {
      const result = await runComplianceCheck(companyId);
      complianceResult = result;
      state.alertsSent = result.alertas_enviados;
      state.alertsStopped = result.alertas_parados;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      step = failStep(step, errorMsg);
      state.steps[state.steps.length - 1] = step;
      state.errors.push(`Erro na compliance: ${errorMsg}` as string);
      throw err;
    }

    step = completeStep(step, {
      checksPerformed: complianceResult.checks_realizados,
      alertsSent: state.alertsSent,
      alertsStopped: state.alertsStopped,
    });
    state.steps[state.steps.length - 1] = step;

    // STEP 5: Log decision
    await logAgentDecision({
      run_id: runId,
      agent_name: "operacional",
      step_name: "compliance-check",
      decision_type: "action",
      input_summary: `Compliance check para empresa ${companyId}`,
      output_summary: `Verificações: ${complianceResult.checks_realizados}, Alertas: ${state.alertsSent} enviados, ${state.alertsStopped} parados`,
      confidence: 1.0,
      escalated_to_human: false,
      tokens_input: 0,
      tokens_output: 0,
    });

    // STEP 6: Complete run
    state.totalTokens = tokenTracker.total;
    state.totalCostUsd = tokenTracker.cost;
    state.cacheReadTokens = tokenTracker.stats.cacheRead;
    state.cacheWriteTokens = tokenTracker.stats.cacheWrite;

    const stats = tokenTracker.stats;
    stats.steps = state.steps.length;

    await completeAgentRun(runId, "operacional", "completed", state as Record<string, unknown>, stats);

    return state;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    state.errors.push(errorMsg as string);

    state.totalTokens = tokenTracker.total;
    state.totalCostUsd = tokenTracker.cost;
    state.cacheReadTokens = tokenTracker.stats.cacheRead;
    state.cacheWriteTokens = tokenTracker.stats.cacheWrite;

    const stats = tokenTracker.stats;
    stats.steps = state.steps.length;

    await completeAgentRun(runId, "operacional", "failed", state as Record<string, unknown>, stats, errorMsg);

    return state;
  }
}

// ────────────────────────────────────────────────────────────────────
// MAIN: runOperacionalWorkflow
// ────────────────────────────────────────────────────────────────────

/**
 * Processa workflows originados de emails classificados
 * - Recebe resultado do Captador (tipoDemanda, dadosExtraidos)
 * - Verifica billing (R3)
 * - Baseado em tipoDemanda, determina ação GESP necessária
 * - Para operações críticas (arma, encerramento): human-in-the-loop
 * - Executa ações não-críticas imediatamente
 * - Enfileira tarefas críticas para aprovação humana
 *
 * @param companyId ID da empresa
 * @param workflowId ID do workflow do Captador
 * @param tipoDemanda Tipo de demanda classificada (novo_vigilante, arma, etc.)
 * @param dadosExtraidos Dados extraídos do email
 * @returns OperacionalState com status final
 */
export async function runOperacionalWorkflow(
  companyId: string,
  workflowId: string,
  tipoDemanda: string,
  dadosExtraidos: Record<string, unknown>
): Promise<OperacionalState> {
  const _supabase = createSupabaseAdmin();
  const tokenTracker = new TokenTracker();

  // STEP 1: Start agent run
  const runId = (await startAgentRun(
    "operacional",
    "chain",
    `workflow:${tipoDemanda}`,
    companyId,
    { workflowId, tipoDemanda, dadosExtraidos }
  )) as string;

  const state = initializeOperacionalState(
    runId,
    companyId,
    "chain",
    `workflow:${tipoDemanda}`
  );
  state.workflowId = workflowId;
  state.tipoDemanda = tipoDemanda;
  state.dadosExtraidos = dadosExtraidos;

  try {
    // STEP 2: Billing Gate Check (R3)
    let step = startStep(createStep("billing-gate-check"));
    state.steps.push(step);

    const isAllowed = await isOperationAllowed(companyId, `workflow_${tipoDemanda}`);
    if (!isAllowed) {
      const billingGate = await checkBillingGate(companyId);
      step = failStep(
        step,
        `Billing gate failed: ${billingGate.reason || billingGate.status}`
      );
      state.steps[state.steps.length - 1] = step;
      state.errors.push(`Workflow bloqueado por billing: ${billingGate.status}` as string);

      await logAgentDecision({
        run_id: runId,
        agent_name: "operacional",
        step_name: "billing-gate-check",
        decision_type: "action",
        input_summary: `Verificar billing para workflow ${tipoDemanda}`,
        output_summary: `Workflow bloqueado por billing`,
        confidence: 1.0,
        escalated_to_human: true,
        tokens_input: 0,
        tokens_output: 0,
      });

      throw new Error(`Workflow bloqueado: billing suspenso`);
    }

    step = completeStep(step, { operationAllowed: true });
    state.steps[state.steps.length - 1] = step;

    // STEP 3: Determine if critical operation (human-in-the-loop required)
    step = startStep(createStep("classify-operation-criticality"));
    state.steps.push(step);

    const isCritical = isCriticalOperation(tipoDemanda);

    step = completeStep(step, {
      isCritical,
      tipoDemanda,
      reason: isCritical ? "Operação requer aprovação humana" : undefined,
    });
    state.steps[state.steps.length - 1] = step;

    // STEP 4: Route to appropriate handler
    if (isCritical) {
      // ────── CRITICAL PATH: Human-in-the-loop ──────
      step = startStep(createStep("queue-for-human-approval"));
      state.steps.push(step);

      state.needsHumanApproval = true;
      state.humanApprovalReason = `${tipoDemanda} requer aprovação humana`;

      // Create GESP task and mark as awaiting_approval
      const taskId = await createGespTask(companyId, tipoDemanda, dadosExtraidos);

      step = completeStep(step, {
        taskQueued: true,
        taskId,
        approvalUrl: `https://admin.vigi.com.br/approvals/${taskId}`,
      });
      state.steps[state.steps.length - 1] = step;

      // Send notification to team
      await addEmailSendJob({
        companyId,
        templateId: "N" as const, // Using template N for internal notifications (approval requests)
        mode: "CLIENTE_HTML",
        to: EMAIL_EQUIPE,
        subject: `[VIG PRO] Aprovação Necessária: ${tipoDemanda} para empresa ${companyId}`,
        payload: {
          taskId,
          tipoDemanda,
          companyId,
          dadosExtraidos,
          approvalUrl: `https://admin.vigi.com.br/approvals/${taskId}`,
        },
      });

      await logAgentDecision({
        run_id: runId,
        agent_name: "operacional",
        step_name: "queue-for-human-approval",
        decision_type: "escalation",
        input_summary: `Workflow ${tipoDemanda} para empresa ${companyId}`,
        output_summary: `Escalado para aprovação humana, taskId=${taskId}`,
        confidence: 1.0,
        escalated_to_human: true,
        tokens_input: 0,
        tokens_output: 0,
      });
    } else {
      // ────── NON-CRITICAL PATH: Execute immediately ──────
      step = startStep(createStep("execute-workflow-action"));
      state.steps.push(step);

      try {
        // Determine GESP action based on tipoDemanda
        const actionResult = await executeWorkflowAction(
          companyId,
          tipoDemanda,
          dadosExtraidos
        );

        state.gespTasksCompleted = 1;

        step = completeStep(step, {
          actionExecuted: true,
          ...actionResult,
        });
        state.steps[state.steps.length - 1] = step;

        await logAgentDecision({
          run_id: runId,
          agent_name: "operacional",
          step_name: "execute-workflow-action",
          decision_type: "action",
          input_summary: `Executar ${tipoDemanda}`,
          output_summary: `Ação executada com sucesso`,
          confidence: 1.0,
          escalated_to_human: false,
          tokens_input: 0,
          tokens_output: 0,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        step = failStep(step, errorMsg);
        state.steps[state.steps.length - 1] = step;
        state.errors.push(`Erro ao executar workflow: ${errorMsg}` as string);
        throw err;
      }
    }

    // STEP 5: Complete run
    state.totalTokens = tokenTracker.total;
    state.totalCostUsd = tokenTracker.cost;
    state.cacheReadTokens = tokenTracker.stats.cacheRead;
    state.cacheWriteTokens = tokenTracker.stats.cacheWrite;

    const stats = tokenTracker.stats;
    stats.steps = state.steps.length;

    await completeAgentRun(runId, "operacional", "completed", state as Record<string, unknown>, stats);

    return state;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    state.errors.push(errorMsg as string);

    state.totalTokens = tokenTracker.total;
    state.totalCostUsd = tokenTracker.cost;
    state.cacheReadTokens = tokenTracker.stats.cacheRead;
    state.cacheWriteTokens = tokenTracker.stats.cacheWrite;

    const stats = tokenTracker.stats;
    stats.steps = state.steps.length;

    await completeAgentRun(runId, "operacional", "failed", state as Record<string, unknown>, stats, errorMsg);

    return state;
  }
}

// ────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────

/**
 * Determina se uma operação requer aprovação humana
 * Críticas: arma, encerramento, destruição, alteração de postos
 * Não-críticas: novo vigilante, renovação, reciclagem
 */
function isCriticalOperation(tipoDemanda: string): boolean {
  const criticalTypes = [
    "arma",
    "arma_adicional",
    "encerramento",
    "destruicao",
    "alteracao_postos",
    "mudanca_funcao_critica",
  ];
  return criticalTypes.includes(tipoDemanda);
}

/**
 * Cria uma tarefa GESP para operação crítica
 * Marca como awaiting_approval para análise por humano
 */
async function createGespTask(
  companyId: string,
  tipoDemanda: string,
  dadosExtraidos: Record<string, unknown>
): Promise<string> {
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from("gesp_tasks")
    .insert({
      company_id: companyId,
      tipo_acao: tipoDemanda,
      payload: dadosExtraidos,
      status: "awaiting_approval", // Human review required
      tentativas: 0,
      max_tentativas: 3,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Erro ao criar GESP task: ${error?.message || "unknown"}`);
  }

  return data.id;
}

/**
 * Executa ação de workflow não-crítica
 * Cria GESP task com status pendente para execução imediata
 */
async function executeWorkflowAction(
  companyId: string,
  tipoDemanda: string,
  dadosExtraidos: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const supabase = createSupabaseAdmin();

  // Cria task GESP com status pendente
  const { data: task, error: taskError } = await supabase
    .from("gesp_tasks")
    .insert({
      company_id: companyId,
      tipo_acao: tipoDemanda,
      payload: dadosExtraidos,
      status: "pendente", // Pode ser executada imediatamente
      tentativas: 0,
      max_tentativas: 3,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (taskError || !task) {
    throw new Error(`Erro ao criar GESP task: ${taskError?.message || "unknown"}`);
  }

  // Enfileira sync GESP para executar a tarefa
  await addGespSyncJob(companyId, "urgente");

  return {
    taskId: task.id,
    status: "pendente",
    syncJobQueued: true,
  };
}
