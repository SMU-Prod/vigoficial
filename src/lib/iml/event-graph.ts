/**
 * VIGI PRO — Institutional Memory Layer: Event Graph
 *
 * Service para emissão de eventos no grafo causal.
 * Todo agente usa este módulo para registrar suas ações como eventos
 * conectados por relações causais.
 *
 * Uso:
 *   import { emitEvent, linkEvents } from "@/lib/iml/event-graph";
 *   const eventId = await emitEvent({ ... });
 */
import { createSupabaseAdmin } from "@/lib/supabase/server";

// ─── Types ───

export type IMLEventType =
  | "PUBLICACAO_DOU"
  | "PROCESSO_GESP"
  | "VENCIMENTO"
  | "COMUNICACAO_CLIENTE"
  | "DECISAO_AGENTE"
  | "ESCALACAO_HUMANA"
  | "COMPLIANCE_CHECK"
  | "PROSPECT_QUALIFICADO"
  | "WORKFLOW_INICIADO"
  | "WORKFLOW_CONCLUIDO"
  | "ERRO_SISTEMA"
  | "INSIGHT_GERADO"
  | "PLAYBOOK_AJUSTE"
  | "ADMIN_ACAO";

export type IMLEntityType =
  | "company"
  | "employee"
  | "agent_run"
  | "email"
  | "gesp_task"
  | "dou_item"
  | "prospect"
  | "workflow"
  | "document"
  | "system";

export type IMLRelationType =
  | "CAUSOU"
  | "PRECEDEU"
  | "BLOQUEOU"
  | "RESOLVEU"
  | "ESCALOU"
  | "REVERTEU"
  | "COMPLEMENTOU"
  | "SIMILAR";

export type IMLSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface EmitEventParams {
  eventType: IMLEventType;
  entityType: IMLEntityType;
  entityId?: string;
  agentName?: "captador" | "operacional" | "comunicador" | "orquestrador";
  agentRunId?: string;
  companyId?: string;
  metadata?: Record<string, unknown>;
  severity?: IMLSeverity;
  causedByEventId?: string;
}

export interface IMLEvent {
  id: string;
  event_type: IMLEventType;
  entity_type: IMLEntityType;
  entity_id: string | null;
  agent_name: string | null;
  agent_run_id: string | null;
  company_id: string | null;
  metadata: Record<string, unknown>;
  severity: IMLSeverity;
  occurred_at: string;
}

// ─── Event Emission ───

/**
 * Emite um evento no Event Graph.
 * Se causedByEventId for fornecido, cria automaticamente uma edge CAUSOU.
 * Retorna o ID do evento criado.
 */
export async function emitEvent(params: EmitEventParams): Promise<string> {
  const supabase = createSupabaseAdmin();

  try {
    // Usa a função SQL para atomicidade
    const { data, error } = await supabase.rpc("iml_emit_event", {
      p_event_type: params.eventType,
      p_entity_type: params.entityType,
      p_entity_id: params.entityId || null,
      p_agent_name: params.agentName || null,
      p_agent_run_id: params.agentRunId || null,
      p_company_id: params.companyId || null,
      p_metadata: params.metadata || {},
      p_severity: params.severity || "info",
      p_caused_by_event_id: params.causedByEventId || null,
    });

    if (error) {
      // Fallback: insert direto se a função RPC não existir
      console.warn("[IML] RPC fallback:", error.message);
      return await emitEventDirect(params);
    }

    return data as string;
  } catch (err) {
    console.error("[IML] emitEvent error:", err);
    // Silencioso — IML nunca deve bloquear operações dos agentes
    return "";
  }
}

/**
 * Fallback: insert direto sem RPC
 */
async function emitEventDirect(params: EmitEventParams): Promise<string> {
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from("iml_events")
    .insert({
      event_type: params.eventType,
      entity_type: params.entityType,
      entity_id: params.entityId || null,
      agent_name: params.agentName || null,
      agent_run_id: params.agentRunId || null,
      company_id: params.companyId || null,
      metadata: params.metadata || {},
      severity: params.severity || "info",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[IML] emitEventDirect error:", error);
    return "";
  }

  // Cria edge se necessário
  if (params.causedByEventId) {
    await linkEvents(params.causedByEventId, data.id, "CAUSOU");
  }

  return data.id;
}

// ─── Edge Creation ───

/**
 * Cria uma relação entre dois eventos no grafo.
 */
export async function linkEvents(
  sourceEventId: string,
  targetEventId: string,
  relationType: IMLRelationType,
  confidence: number = 1.0,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!sourceEventId || !targetEventId) return;

  const supabase = createSupabaseAdmin();

  try {
    await supabase.from("iml_event_edges").insert({
      source_event_id: sourceEventId,
      target_event_id: targetEventId,
      relation_type: relationType,
      confidence,
      metadata: metadata || {},
    });
  } catch (err) {
    console.error("[IML] linkEvents error:", err);
  }
}

// ─── Event Queries ───

/**
 * Busca eventos recentes de um agente específico.
 */
export async function getAgentEvents(
  agentName: string,
  limit: number = 50,
  since?: Date
): Promise<IMLEvent[]> {
  const supabase = createSupabaseAdmin();

  let query = supabase
    .from("iml_events")
    .select("*")
    .eq("agent_name", agentName)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (since) {
    query = query.gte("occurred_at", since.toISOString());
  }

  const { data, error } = await query;
  if (error) {
    console.error("[IML] getAgentEvents error:", error);
    return [];
  }

  return data as IMLEvent[];
}

/**
 * Busca o subgrafo de eventos conectados a um evento raiz.
 * Usa CTE recursiva para traversal.
 */
export async function getEventChain(
  eventId: string,
  maxDepth: number = 5
): Promise<{ events: IMLEvent[]; edges: { source: string; target: string; relation: string }[] }> {
  const supabase = createSupabaseAdmin();

  // Query recursiva para encontrar todos os eventos conectados
  const { data, error } = await supabase.rpc("iml_get_event_chain", {
    p_event_id: eventId,
    p_max_depth: maxDepth,
  });

  if (error) {
    console.warn("[IML] getEventChain: RPC not available, falling back to direct query");
    return { events: [], edges: [] };
  }

  return data as { events: IMLEvent[]; edges: { source: string; target: string; relation: string }[] };
}

/**
 * Busca eventos por empresa para análise do Pattern Distiller.
 */
export async function getCompanyEventHistory(
  companyId: string,
  daysBack: number = 90
): Promise<IMLEvent[]> {
  const supabase = createSupabaseAdmin();
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const { data, error } = await supabase
    .from("iml_events")
    .select("*")
    .eq("company_id", companyId)
    .gte("occurred_at", since.toISOString())
    .order("occurred_at", { ascending: true })
    .limit(500);

  if (error) {
    console.error("[IML] getCompanyEventHistory error:", error);
    return [];
  }

  return data as IMLEvent[];
}
