/**
 * VIGI PRO — GESP Admin Authorization Gate
 *
 * Toda decisão de execução no GESP deve passar por este gate.
 * O agente solicita aprovação → admin autoriza → agente executa.
 *
 * Nenhuma ação de gravação/submissão no GESP ocorre sem aprovação explícita.
 *
 * Fluxo:
 *   1. Agente identifica a ação necessária (ex: registrar ocorrência)
 *   2. Agente chama requestAdminApproval() → cria registro pending
 *   3. Admin vê no dashboard, aprova ou rejeita
 *   4. Agente chama waitForApproval() — bloqueia até decisão ou timeout
 *   5. Se aprovado → agente executa. Se rejeitado → agente aborta.
 *
 * Processos readonly (quadro_avisos, acompanhar_processos) NÃO precisam de aprovação.
 */

import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/config/env";
import { requiresAdminApproval, getGespProcess } from "./knowledge-base";
import type { AgentName } from "@/lib/agents/types";

// ─── Types ───

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";
export type ApprovalUrgency = "low" | "normal" | "high" | "critical";

export interface GespApprovalRequest {
  id: string;
  companyId: string;
  processCode: string;
  processName: string;
  agentName: AgentName;
  agentRunId: string;
  payload: Record<string, unknown>;
  urgency: ApprovalUrgency;
  status: ApprovalStatus;
  adminNotes: string | null;
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  expiresAt: string | null;
}

export interface ApprovalResult {
  approved: boolean;
  approvalId: string;
  status: ApprovalStatus;
  adminNotes: string | null;
  decidedAt: string | null;
}

// ─── Timeouts ───

const DEFAULT_POLL_INTERVAL_MS = 5_000; // 5s entre polls
const DEFAULT_APPROVAL_TIMEOUT_MS = 30 * 60 * 1000; // 30min padrão
const CRITICAL_APPROVAL_TIMEOUT_MS = 60 * 60 * 1000; // 60min para crítico (comunicar ocorrência)

// TTL para aprovações não respondidas
const APPROVAL_TTL_HOURS: Record<ApprovalUrgency, number> = {
  low: 72,
  normal: 24,
  high: 8,
  critical: 2,
};

// ─── Supabase Client ───

function getSupabase() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
}

// ─── Core Functions ───

/**
 * Solicita aprovação do admin para executar uma ação no GESP.
 * Retorna imediatamente com o approvalId — não bloqueia.
 *
 * @param companyId     ID da empresa no sistema
 * @param processCode   Código do processo GESP (ex: "comunicar_ocorrencia")
 * @param agentName     Nome do agente solicitante
 * @param agentRunId    ID do run atual do agente
 * @param payload       Dados que serão usados na execução (para admin revisar)
 * @param urgency       Urgência da aprovação
 * @param notes         Contexto adicional para o admin
 */
export async function requestAdminApproval(
  companyId: string,
  processCode: string,
  agentName: AgentName,
  agentRunId: string,
  payload: Record<string, unknown>,
  urgency: ApprovalUrgency = "normal",
  notes?: string,
): Promise<string> {
  // Readonly processes skip the gate
  if (!requiresAdminApproval(processCode)) {
    throw new Error(
      `Process "${processCode}" is readonly and does not need admin approval. ` +
      `Call it directly without the admin gate.`
    );
  }

  const process = getGespProcess(processCode);
  if (!process) {
    throw new Error(`Unknown GESP process code: "${processCode}". Check knowledge-base.ts.`);
  }

  const supabase = getSupabase();
  const ttlHours = APPROVAL_TTL_HOURS[urgency];
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("gesp_approvals")
    .insert({
      company_id: companyId,
      process_code: processCode,
      process_name: process.name,
      agent_name: agentName,
      agent_run_id: agentRunId,
      payload,
      urgency,
      status: "pending",
      admin_notes: notes ?? null,
      requested_at: new Date().toISOString(),
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create approval request: ${error?.message ?? "unknown error"}`);
  }

  // Send real-time alert to admin (via Supabase Realtime broadcast)
  try {
    const channel = supabase.channel("admin-alerts");
    await channel.send({
      type: "broadcast",
      event: "gesp_approval_requested",
      payload: {
        approvalId: data.id,
        companyId,
        processCode,
        processName: process.name,
        urgency,
        agentName,
        riskLevel: process.riskLevel,
        deadline: process.deadline,
      },
    });
  } catch {
    // Non-blocking — approval record already created
  }

  return data.id;
}

/**
 * Verifica o status atual de uma aprovação.
 * Não bloqueia — retorna o estado atual imediatamente.
 */
export async function checkApprovalStatus(
  approvalId: string,
): Promise<ApprovalResult> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("gesp_approvals")
    .select("id, status, admin_notes, decided_at")
    .eq("id", approvalId)
    .single();

  if (error || !data) {
    throw new Error(`Approval not found: ${approvalId}`);
  }

  // Check expiry
  const { data: full } = await supabase
    .from("gesp_approvals")
    .select("expires_at, urgency")
    .eq("id", approvalId)
    .single();

  let status = data.status as ApprovalStatus;
  if (status === "pending" && full?.expires_at) {
    const expired = new Date(full.expires_at) < new Date();
    if (expired) {
      status = "expired";
      // Mark as expired in DB
      await supabase
        .from("gesp_approvals")
        .update({ status: "expired" })
        .eq("id", approvalId);
    }
  }

  return {
    approved: status === "approved",
    approvalId,
    status,
    adminNotes: data.admin_notes ?? null,
    decidedAt: data.decided_at ?? null,
  };
}

/**
 * Aguarda aprovação do admin com polling.
 * Bloqueia a execução do agente até: aprovado / rejeitado / expirado / timeout.
 *
 * @param approvalId        ID retornado por requestAdminApproval()
 * @param timeoutMs         Timeout máximo de espera (default: 30min, critical: 60min)
 * @param pollIntervalMs    Intervalo de polling (default: 5s)
 */
export async function waitForApproval(
  approvalId: string,
  timeoutMs?: number,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
): Promise<ApprovalResult> {
  const deadline = Date.now() + (timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS);

  while (Date.now() < deadline) {
    const result = await checkApprovalStatus(approvalId);

    if (result.status !== "pending") {
      return result;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  // Timeout reached — mark as expired
  try {
    const supabase = getSupabase();
    await supabase
      .from("gesp_approvals")
      .update({ status: "expired" })
      .eq("id", approvalId);
  } catch {
    // Best effort
  }

  return {
    approved: false,
    approvalId,
    status: "expired",
    adminNotes: "Timeout: admin did not respond within the allowed window.",
    decidedAt: null,
  };
}

/**
 * Aguarda aprovação para processos CRÍTICOS com prazo de 24h.
 * Usa timeout maior (60min) e urgência critical.
 */
export async function waitForCriticalApproval(
  approvalId: string,
): Promise<ApprovalResult> {
  return waitForApproval(approvalId, CRITICAL_APPROVAL_TIMEOUT_MS);
}

// ─── Admin Dashboard Queries ───

/**
 * Lista todas as aprovações pendentes para o dashboard do admin.
 * Ordenadas por urgência e data de solicitação.
 */
export async function getAdminPendingApprovals(
  companyId?: string,
): Promise<GespApprovalRequest[]> {
  const supabase = getSupabase();

  let query = supabase
    .from("gesp_approvals")
    .select("*")
    .eq("status", "pending")
    .order("urgency", { ascending: false }) // critical first
    .order("requested_at", { ascending: true }); // oldest first within urgency

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch pending approvals: ${error.message}`);
  }

  return (data ?? []).map(mapRow);
}

/**
 * Lista histórico de aprovações (todas as decisões tomadas).
 */
export async function getApprovalHistory(
  companyId?: string,
  limit = 50,
): Promise<GespApprovalRequest[]> {
  const supabase = getSupabase();

  let query = supabase
    .from("gesp_approvals")
    .select("*")
    .neq("status", "pending")
    .order("requested_at", { ascending: false })
    .limit(limit);

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch approval history: ${error.message}`);
  }

  return (data ?? []).map(mapRow);
}

// ─── Admin Decision Functions ───

/**
 * Admin aprova uma solicitação de execução GESP.
 * Chamado pelo endpoint da dashboard do admin.
 */
export async function adminApproveAction(
  approvalId: string,
  adminUserId: string,
  notes?: string,
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from("gesp_approvals")
    .update({
      status: "approved",
      admin_notes: notes ?? null,
      decided_at: new Date().toISOString(),
      decided_by: adminUserId,
    })
    .eq("id", approvalId)
    .eq("status", "pending"); // Only update if still pending

  if (error) {
    throw new Error(`Failed to approve action: ${error.message}`);
  }
}

/**
 * Admin rejeita uma solicitação de execução GESP.
 */
export async function adminRejectAction(
  approvalId: string,
  adminUserId: string,
  reason: string,
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from("gesp_approvals")
    .update({
      status: "rejected",
      admin_notes: reason,
      decided_at: new Date().toISOString(),
      decided_by: adminUserId,
    })
    .eq("id", approvalId)
    .eq("status", "pending");

  if (error) {
    throw new Error(`Failed to reject action: ${error.message}`);
  }
}

// ─── Guard Function ───

/**
 * Guard principal: solicita aprovação e aguarda decisão.
 * Use este helper nos agentes para simplificar o fluxo.
 *
 * @example
 * ```ts
 * const result = await requireApprovalAndWait(
 *   companyId,
 *   "comunicar_ocorrencia",
 *   "operacional",
 *   runId,
 *   { ocorrencia: { tipo: "roubo", data: "2026-04-05" } },
 *   "critical",
 * );
 * if (!result.approved) {
 *   logger.warn("Ação rejeitada pelo admin", { reason: result.adminNotes });
 *   return;
 * }
 * // Proceed with GESP action
 * ```
 */
export async function requireApprovalAndWait(
  companyId: string,
  processCode: string,
  agentName: AgentName,
  agentRunId: string,
  payload: Record<string, unknown>,
  urgency: ApprovalUrgency = "normal",
  contextNotes?: string,
): Promise<ApprovalResult> {
  const process = getGespProcess(processCode);

  // Readonly: skip gate entirely
  if (!requiresAdminApproval(processCode)) {
    return {
      approved: true,
      approvalId: "readonly-skip",
      status: "approved",
      adminNotes: "Readonly process — no approval required",
      decidedAt: new Date().toISOString(),
    };
  }

  // Request approval
  const approvalId = await requestAdminApproval(
    companyId,
    processCode,
    agentName,
    agentRunId,
    payload,
    urgency,
    contextNotes,
  );

  // Use extended timeout for critical processes (24h deadline)
  const isCritical = process?.deadline === "24h" || urgency === "critical";
  return isCritical
    ? waitForCriticalApproval(approvalId)
    : waitForApproval(approvalId);
}

// ─── Helpers ───

function mapRow(row: Record<string, unknown>): GespApprovalRequest {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    processCode: row.process_code as string,
    processName: row.process_name as string,
    agentName: row.agent_name as AgentName,
    agentRunId: row.agent_run_id as string,
    payload: (row.payload as Record<string, unknown>) ?? {},
    urgency: row.urgency as ApprovalUrgency,
    status: row.status as ApprovalStatus,
    adminNotes: (row.admin_notes as string) ?? null,
    requestedAt: row.requested_at as string,
    decidedAt: (row.decided_at as string) ?? null,
    decidedBy: (row.decided_by as string) ?? null,
    expiresAt: (row.expires_at as string) ?? null,
  };
}
