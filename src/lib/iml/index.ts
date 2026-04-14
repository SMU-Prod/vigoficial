/**
 * VIGI PRO — Institutional Memory Layer (IML)
 * Public API
 *
 * 3 componentes:
 * 1. Event Graph — registra e conecta todos os eventos do sistema
 * 2. Pattern Distiller — extrai padrões dos eventos (1x/dia)
 * 3. Adaptive Playbook — parametriza regras R1-R12 baseado em insights
 *
 * SEGURANÇA: Toda ação automática requer admin_approved = true.
 */

// Event Graph
export {
  emitEvent,
  linkEvents,
  getAgentEvents,
  getEventChain,
  getCompanyEventHistory,
  type IMLEventType,
  type IMLEntityType,
  type IMLRelationType,
  type IMLSeverity,
  type EmitEventParams,
  type IMLEvent,
} from "./event-graph";

// Pattern Distiller
export { runPatternDistillation } from "./pattern-distiller";

// Adaptive Playbook
export {
  queryPlaybook,
  logPlaybookApplication,
  updatePlaybookOutcome,
  approveInsightToPlaybook,
  rejectInsight,
  deactivatePlaybookRule,
  getPendingInsights,
  type PlaybookRule,
  type PlaybookAdjustment,
  type PlaybookQueryContext,
} from "./adaptive-playbook";

// Agent Decorator
export { withIML, type IMLContext } from "./agent-decorator";
