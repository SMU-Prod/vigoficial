/**
 * VIGI CognitiveEngine — Public API
 *
 * Camada cognitiva que permite aos agentes entender contexto completo,
 * navegar documentos/links/PDFs, e executar workflows autonomamente
 * seguindo o PRD e as regras R1-R12.
 *
 * Uso:
 *   import { CognitiveEngine } from "@/lib/cognitive";
 *   const engine = new CognitiveEngine({ companyId: "..." });
 *   const analysis = await engine.analyzeEmail(subject, body, html, from);
 */

export { CognitiveEngine } from "./engine";
export { DocumentProcessor } from "./document-processor";
export { PageNavigator } from "./page-navigator";
export { WorkflowResolver } from "./workflow-resolver";

export type {
  ContentUnit,
  ContentType,
  ContentSource,
  DiscoveredLink,
  DiscoveredAttachment,
  CognitiveAnalysis,
  CognitiveClassification,
  CognitiveEngineConfig,
  NavigationDecision,
  TipoDemanda,
  WorkflowAction,
  WorkflowActionType,
  WorkflowDefinition,
  WorkflowStepDefinition,
} from "./types";

export { DEFAULT_COGNITIVE_CONFIG } from "./types";
