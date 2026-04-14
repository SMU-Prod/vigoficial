/**
 * VIGI CognitiveEngine — Type Definitions
 *
 * Camada cognitiva que permite aos agentes entender contexto completo,
 * navegar documentos/links/PDFs, e executar workflows autonomamente.
 *
 * PRD Seção 9 — 14 tipos de demanda com workflows distintos
 * PRD Seção 6 — Regras R1-R12 governam todas as decisões
 */

// ─── Content Types ───────────────────────────────────────────────
export type ContentType =
  | "email"
  | "html_page"
  | "pdf"
  | "dou_publication"
  | "gesp_page"
  | "attachment"
  | "unknown";

export type ContentSource =
  | "gmail"
  | "dou_scraper"
  | "gesp_portal"
  | "r2_storage"
  | "url_fetch"
  | "manual_upload";

/**
 * Unidade atômica de conteúdo que o CognitiveEngine processa.
 * Pode ser um email, uma página HTML, um PDF, etc.
 */
export interface ContentUnit {
  id: string;
  type: ContentType;
  source: ContentSource;
  url?: string;
  title?: string;
  rawText: string;
  rawHtml?: string;
  metadata: Record<string, unknown>;
  /** Links e botões encontrados no conteúdo */
  discoveredLinks: DiscoveredLink[];
  /** Anexos ou documentos referenciados */
  discoveredAttachments: DiscoveredAttachment[];
  /** Timestamp de quando foi processado */
  processedAt: string;
  /** Profundidade de navegação (0 = conteúdo original, 1+ = navegado via link) */
  depth: number;
  /** ID do ContentUnit pai (se navegado via link) */
  parentId?: string;
}

export interface DiscoveredLink {
  text: string;
  url: string;
  type: "anchor" | "button" | "form_action" | "redirect";
  relevanceScore?: number;
  /** Se a IA determinou que este link deve ser seguido */
  shouldFollow?: boolean;
  /** Motivo da decisão de seguir/ignorar */
  followReason?: string;
}

export interface DiscoveredAttachment {
  name: string;
  type: "pdf" | "image" | "document" | "spreadsheet" | "other";
  url?: string;
  size?: number;
  /** Conteúdo extraído do anexo (se processado) */
  extractedText?: string;
}

// ─── Workflow Types ──────────────────────────────────────────────
export type TipoDemanda =
  | "novo_vigilante"
  | "novo_posto"
  | "compra_arma"
  | "venda_arma"
  | "transporte_equipamento"
  | "encerramento_posto"
  | "transferencia_posto"
  | "renovacao_cnv"
  | "compra_colete"
  | "baixa_colete"
  | "correcao_dados"
  | "manutencao_veiculo"
  | "reciclagem"
  | "renovacao_alvara"
  | "criar_turma"
  | "guia_transporte"
  | "comunicacao_ocorrencia"
  | "comunicacao_evento"
  | "credenciamento_instrutor"
  | "solicitar_cnv"
  | "notificacao_autonoma"
  | "processo_autorizativo"
  | "importacao_xml"
  | "caso_desconhecido";

/**
 * Resultado da análise cognitiva completa de um conteúdo.
 */
export interface CognitiveAnalysis {
  /** ID único da análise */
  analysisId: string;
  /** Conteúdo primário analisado */
  primaryContent: ContentUnit;
  /** Conteúdos adicionais descobertos e navegados */
  navigatedContents: ContentUnit[];
  /** Classificação final (pode mudar após navegar links) */
  classification: CognitiveClassification;
  /** Dados extraídos consolidados de TODAS as fontes */
  extractedData: Record<string, unknown>;
  /** Chain de ações recomendadas */
  recommendedActions: WorkflowAction[];
  /** Regras do PRD que se aplicam */
  applicableRules: string[];
  /** Se precisa aprovação humana */
  requiresHumanApproval: boolean;
  /** Motivo da escalação (se aplicável) */
  escalationReason?: string;
  /** Token usage total */
  totalTokens: { input: number; output: number; cacheRead: number };
  /** Duração total do processamento */
  processingTimeMs: number;
}

export interface CognitiveClassification {
  tipoDemanda: TipoDemanda;
  confidence: number;
  urgente: boolean;
  resumo: string;
  /** Se a classificação mudou após navegar links/anexos */
  reclassified: boolean;
  /** Classificação original (antes de navegar) */
  originalTipoDemanda?: TipoDemanda;
  originalConfidence?: number;
}

/**
 * Ação individual dentro de um workflow.
 * O CognitiveEngine monta a cadeia de ações necessárias.
 */
export interface WorkflowAction {
  id: string;
  type: WorkflowActionType;
  description: string;
  /** Agente responsável pela execução */
  targetAgent: "captador" | "operacional" | "comunicador" | "orquestrador";
  /** Prioridade: 1 = urgente, 10 = normal */
  priority: number;
  /** Dados de input para a ação */
  payload: Record<string, unknown>;
  /** Dependências (IDs de ações que devem completar antes) */
  dependsOn: string[];
  /** Template de email/ofício associado (se aplicável) */
  template?: string;
  /** Regra do PRD que motiva esta ação */
  prdRule?: string;
  status: "pending" | "executing" | "completed" | "failed" | "skipped";
}

export type WorkflowActionType =
  | "classify_content"
  | "extract_data"
  | "navigate_link"
  | "download_document"
  | "gesp_action"
  | "send_email_client"
  | "send_oficio_pf"
  | "create_process"
  | "update_database"
  | "compliance_check"
  | "generate_alert"
  | "escalate_human"
  | "take_screenshot"
  | "batch_vigilantes"
  | "gesp_criar_processo"
  | "gesp_enviar_processo"
  | "gesp_verificar_pendencias"
  | "gesp_criar_turma"
  | "gesp_enviar_turma"
  | "gesp_importar_xml"
  | "gesp_guia_transporte"
  | "gesp_enviar_guia"
  | "gesp_comunicacao_ocorrencia"
  | "gesp_comunicacao_evento"
  | "gesp_credenciamento"
  | "gesp_solicitar_cnv"
  | "gesp_responder_notificacao"
  | "gesp_cadastrar_procurador"
  | "gesp_snapshot";

// ─── Navigation Decision ─────────────────────────────────────────
export interface NavigationDecision {
  /** Link/attachment sendo avaliado */
  target: DiscoveredLink | DiscoveredAttachment;
  /** Deve navegar? */
  shouldNavigate: boolean;
  /** Motivo */
  reason: string;
  /** Prioridade se deve navegar (menor = mais urgente) */
  priority: number;
  /** Profundidade máxima permitida a partir deste ponto */
  maxDepthFromHere: number;
}

// ─── Cognitive Engine Config ─────────────────────────────────────
export interface CognitiveEngineConfig {
  /** Profundidade máxima de navegação (default: 3) */
  maxNavigationDepth: number;
  /** Máximo de links para seguir por página (default: 5) */
  maxLinksPerPage: number;
  /** Timeout para download/fetch de documentos em ms (default: 30000) */
  fetchTimeoutMs: number;
  /** Se deve processar PDFs automaticamente (default: true) */
  autoProcessPdfs: boolean;
  /** Se deve seguir links automaticamente ou pedir confirmação (default: true) */
  autoFollowLinks: boolean;
  /** Confidence threshold para reclassificação (default: 0.70 — R7) */
  confidenceThreshold: number;
  /** Company ID para contexto de billing/compliance */
  companyId?: string;
  /** Run ID do agente pai para tracking */
  parentRunId?: string;
}

export const DEFAULT_COGNITIVE_CONFIG: CognitiveEngineConfig = {
  maxNavigationDepth: 3,
  maxLinksPerPage: 5,
  fetchTimeoutMs: 30_000,
  autoProcessPdfs: true,
  autoFollowLinks: true,
  confidenceThreshold: 0.70,
};

// ─── Workflow Definition (PRD Seção 9) ───────────────────────────
/**
 * Definição estática de um workflow por tipo de demanda.
 * Cada tipo tem uma sequência de ações pré-definidas pelo PRD.
 */
export interface WorkflowDefinition {
  tipoDemanda: TipoDemanda;
  name: string;
  description: string;
  /** Seção do PRD que define este workflow */
  prdSection: string;
  /** Ações que compõem o workflow, em ordem */
  steps: WorkflowStepDefinition[];
  /** Templates de email/ofício usados */
  templates: string[];
  /** Regras que se aplicam especificamente */
  rules: string[];
  /** Se exige interação com GESP */
  requiresGesp: boolean;
  /** Se gera ofício para PF/DELESP */
  generatesOficio: boolean;
}

export interface WorkflowStepDefinition {
  name: string;
  actionType: WorkflowActionType;
  targetAgent: "captador" | "operacional" | "comunicador";
  description: string;
  /** Campos obrigatórios no payload */
  requiredFields: string[];
  /** Se pode prosseguir com campos faltando */
  allowPartialData: boolean;
  /** Template associado */
  template?: string;
}
