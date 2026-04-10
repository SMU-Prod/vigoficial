/**
 * VIGI Agents — Public API
 * All agent functions exported from here.
 */

// Types
export type {
  AgentName,
  TriggerType,
  AgentRunStatus,
  CaptadorState,
  OperacionalState,
  ComunicadorState,
  OrquestradorState,
} from "./types";

// Base infrastructure
export {
  startAgentRun,
  completeAgentRun,
  logAgentDecision,
  updateSystemHealth,
  TokenTracker,
} from "./base";

// Agents
export {
  runCaptadorDOU,
  runCaptadorEmail,
} from "./captador";

export {
  runOperacionalGESP,
  runOperacionalCompliance,
  runOperacionalWorkflow,
} from "./operacional";

export {
  runComunicadorBatch,
  runComunicadorAlerts,
  runComunicadorOficio,
} from "./comunicador";

export {
  runFullCycle,
  runLightCycle,
  runUrgentCycle,
} from "./orquestrador";
