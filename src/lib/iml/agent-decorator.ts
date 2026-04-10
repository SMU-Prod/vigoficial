/**
 * VIGI PRO — IML Agent Decorator
 *
 * Wrapper que automaticamente emite eventos para o Event Graph
 * sem alterar a lógica interna dos agentes existentes.
 *
 * Padrão: cada agente, antes de executar, consulta o Playbook.
 * Após executar, emite eventos sobre o que aconteceu.
 *
 * Uso:
 *   import { withIML } from "@/lib/iml/agent-decorator";
 *   const result = await withIML("captador", runId, companyId, async (ctx) => {
 *     // ... lógica do agente ...
 *     ctx.emit("PUBLICACAO_DOU", "dou_item", itemId, { resumo: "..." });
 *     return output;
 *   });
 */
import { emitEvent, linkEvents, type IMLEventType, type IMLEntityType, type IMLSeverity } from "./event-graph";
import { queryPlaybook, logPlaybookApplication, updatePlaybookOutcome, type PlaybookAdjustment, type PlaybookQueryContext } from "./adaptive-playbook";
import type { AgentName } from "@/lib/agents/types";

// ─── Types ───

export interface IMLContext {
  /** Emite evento para o Event Graph */
  emit: (
    eventType: IMLEventType,
    entityType: IMLEntityType,
    entityId?: string,
    metadata?: Record<string, unknown>,
    severity?: IMLSeverity,
    causedByEventId?: string,
  ) => Promise<string>;

  /** Cria link causal entre eventos */
  link: (sourceId: string, targetId: string, relation: string) => Promise<void>;

  /** Ajustes do Playbook para esta execução */
  adjustments: PlaybookAdjustment[];

  /** Busca ajuste específico por regra e parâmetro */
  getAdjustment: (ruleCode: string, paramName?: string) => unknown | null;

  /** ID do evento de início da run */
  runEventId: string;
}

// ─── Decorator ───

/**
 * Wraps an agent execution with IML capabilities.
 * Automatically:
 * 1. Queries Playbook for relevant adjustments
 * 2. Emits "run started" event
 * 3. Provides ctx.emit() and ctx.link() for the agent
 * 4. Emits "run completed/failed" event
 * 5. Logs Playbook applications
 *
 * CRITICAL: This decorator is NON-BLOCKING.
 * If IML fails at any point, the agent continues normally.
 */
export async function withIML<T>(
  agentName: AgentName,
  runId: string,
  companyId: string | undefined,
  fn: (ctx: IMLContext) => Promise<T>
): Promise<T> {
  let runEventId = "";
  let adjustments: PlaybookAdjustment[] = [];

  try {
    // 1. Query Playbook for adjustments
    const now = new Date();
    const context: PlaybookQueryContext = {
      agentName,
      companyId,
      hour: now.getHours(),
      dayOfWeek: now.getDay(),
    };

    adjustments = await queryPlaybook("R0", context); // R0 = all rules
    // Also query specific rules this agent uses
    const agentRules: Record<string, string[]> = {
      captador: ["R1", "R3", "R5", "R8"],
      operacional: ["R2", "R3", "R4", "R6", "R8"],
      comunicador: ["R3", "R5", "R7", "R8"],
      orquestrador: ["R1", "R2", "R9", "R10", "R11", "R12"],
    };

    for (const rule of agentRules[agentName] || []) {
      const ruleAdjustments = await queryPlaybook(rule, context);
      adjustments.push(...ruleAdjustments);
    }

    // FIX: IA-08 — Filter adjustments: only include admin-approved playbooks
    adjustments = adjustments.filter((adj) => {
      // Assume admin_approved flag exists in PlaybookAdjustment
      // If not present, filter out for safety
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (adj as any).admin_approved === true;
    });
  } catch {
    // Silencioso — Playbook failure should never block agents
  }

  try {
    // 2. Emit "run started" event
    runEventId = await emitEvent({
      eventType: "DECISAO_AGENTE",
      entityType: "agent_run",
      entityId: runId,
      agentName,
      agentRunId: runId,
      companyId,
      metadata: {
        action: "run_started",
        adjustments_count: adjustments.length,
        adjustments: adjustments.map((a) => ({ rule: a.ruleCode, param: a.paramName })),
      },
      severity: "info",
    });
  } catch {
    // Silencioso
  }

  // 3. Build context for agent
  const ctx: IMLContext = {
    emit: async (eventType, entityType, entityId, metadata, severity, causedByEventId) => {
      try {
        return await emitEvent({
          eventType,
          entityType,
          entityId,
          agentName,
          agentRunId: runId,
          companyId,
          metadata,
          severity,
          causedByEventId: causedByEventId || runEventId,
        });
      } catch {
        return "";
      }
    },

    link: async (sourceId, targetId, relation) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await linkEvents(sourceId, targetId, relation as any);
      } catch {
        // Silencioso
      }
    },

    adjustments,

    getAdjustment: (ruleCode, paramName) => {
      const match = adjustments.find(
        (a) => a.ruleCode === ruleCode && (!paramName || a.paramName === paramName)
      );
      return match?.adjustedValue ?? null;
    },

    runEventId,
  };

  // 4. Execute agent with IML context
  try {
    const result = await fn(ctx);

    // 5. Emit "run completed" event
    try {
      await emitEvent({
        eventType: "DECISAO_AGENTE",
        entityType: "agent_run",
        entityId: runId,
        agentName,
        agentRunId: runId,
        companyId,
        metadata: { action: "run_completed" },
        severity: "info",
        causedByEventId: runEventId,
      });

      // Log Playbook applications as successful
      for (const adj of adjustments) {
        await logPlaybookApplication(
          adj.playbookRuleId,
          runId,
          adj.ruleCode,
          adj.paramName,
          null, // originalValue unknown here
          adj.adjustedValue,
          adj.context,
        );
      }

      await updatePlaybookOutcome(runId, "success");
    } catch {
      // Silencioso
    }

    return result;
  } catch (err) {
    // 6. Emit "run failed" event
    try {
      await emitEvent({
        eventType: "ERRO_SISTEMA",
        entityType: "agent_run",
        entityId: runId,
        agentName,
        agentRunId: runId,
        companyId,
        metadata: {
          action: "run_failed",
          error: err instanceof Error ? err.message : String(err),
        },
        severity: "high",
        causedByEventId: runEventId,
      });

      await updatePlaybookOutcome(runId, "negative", {
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // Silencioso
    }

    throw err; // Re-throw para o caller tratar
  }
}
