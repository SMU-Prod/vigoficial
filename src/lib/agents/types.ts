/**
 * VIGI Agents — Shared Types
 * PRD Seção 5 — Definições compartilhadas entre todos os agentes
 */

// --- Agent Names ---
export type AgentName = "captador" | "operacional" | "comunicador" | "orquestrador";

// --- Trigger Types ---
export type TriggerType = "cron" | "webhook" | "manual" | "urgent" | "chain" | "full" | "light";

// --- Agent Run Status ---
export type AgentRunStatus = "running" | "completed" | "failed" | "timeout" | "cancelled";

// --- Decision Types ---
export type DecisionType = "classification" | "extraction" | "routing" | "action" | "escalation" | "approval";

// --- Base State (shared across all agents) ---
export interface BaseAgentState {
  runId: string;
  agentName: AgentName;
  companyId?: string;
  triggerType: TriggerType;
  triggerSource: string;
  startedAt: string;
  steps: AgentStep[];
  errors: string[];
  totalTokens: number;
  totalCostUsd: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AgentStep {
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  output?: Record<string, unknown>;
}

// --- Captador State ---
export interface CaptadorState extends BaseAgentState {
  // DOU processing
  date?: string;
  douDate?: string;
  douSections?: string[];
  parsedItems?: DOUParsedItem[];
  linkedCompanies?: string[];
  alertsGenerated?: number;

  // Email classification
  emailId?: string;
  email_id?: string;
  companyId?: string;
  company_id?: string;
  runType?: string;
  emailSubject?: string;
  emailBody?: string;
  emailFrom?: string;
  classification?: ClassificationResult;
  extraction?: Record<string, unknown>;
  workflowId?: string;

  // Flexible fields for agent state
  status?: "pending" | "completed" | "failed";
  documentsProcessed?: number;
  matchesFound?: number;

  // Token usage tracking
  tokenUsage?: Record<string, unknown>;

  // Flexible error tracking
  [key: string]: unknown;
}

export interface DOUParsedItem {
  tipo: string;
  cnpj?: string;
  razaoSocial?: string;
  alvaraNumero?: string;
  novaValidade?: string;
  cnvNumero?: string;
  cpf?: string;
  raw: Record<string, unknown>;
}

export interface ClassificationResult {
  tipoDemanda: string;
  confidence: number;
  urgente: boolean;
  resumo?: string;
}

// --- Operacional State ---
// Uses Omit to allow redefining companyId, triggerType, triggerSource from BaseAgentState
export interface OperacionalState extends Omit<BaseAgentState, "companyId" | "triggerType" | "triggerSource"> {
  companyId?: string;

  // GESP
  gespSessionId?: string;
  gespTasksTotal?: number;
  gespTasksCompleted?: number;
  gespTasksFailed?: number;
  gespScreenshots?: string[];

  // Compliance
  complianceChecks?: ComplianceCheckResult[];
  alertsSent?: number;
  alertsStopped?: number;

  // Workflow
  workflowId?: string;
  tipoDemanda?: string;
  dadosExtraidos?: Record<string, unknown>;

  // Human-in-the-loop
  needsHumanApproval?: boolean;
  humanApprovalReason?: string;
  humanDecision?: "approve" | "reject" | "modify";
  humanNotes?: string;

  // Trigger tracking
  triggerType?: TriggerType;
  triggerSource?: string;

  // Flexible fields
  [key: string]: unknown;
}

export interface ComplianceCheckResult {
  entityType: "company" | "employee" | "vehicle";
  entityId: string;
  field: string;
  daysRemaining: number;
  alertLevel: "critical" | "urgent" | "action" | "attention" | "informative";
  templateSent?: string;
}

// --- Comunicador State ---
export interface ComunicadorState extends BaseAgentState {
  // Email queue
  emailsToSend?: EmailToSend[];
  emailsSent?: number;
  emailsFailed?: number;

  // Ofícios
  oficiosGenerated?: number;

  // Notifications
  notificationsSent?: number;

  // Flexible fields
  [key: string]: unknown;
}

export interface EmailToSend {
  companyId: string;
  templateId: string;
  mode: "CLIENTE_HTML" | "OFICIO_PF";
  to: string;
  subject: string;
  payload: Record<string, unknown>;
  priority: "urgent" | "normal" | "low";
}

// --- Orquestrador State ---
export interface OrquestradorState extends Omit<BaseAgentState, "startedAt"> {
  // Cycle info
  cycleType?: "full" | "light" | "urgent";
  cycleTime?: string;
  orquestradorId?: string;
  startedAt?: Date | string;
  completedAt?: Date | string | null;

  // Companies to process
  companiesToProcess?: string[];
  companiesProcessed?: number;

  // Sub-agent dispatches
  dispatches?: AgentDispatch[];

  // Metrics
  totalEmailsRead?: number;
  totalGespTasks?: number;
  totalAlerts?: number;
  totalDouItems?: number;
  totalTokensUsed?: number;

  // Aggregated metrics
  metricsAggregated?: Record<string, unknown>;
  systemHealthUpdates?: SystemHealthMetrics[];

  // Flexible fields
  [key: string]: unknown;
}

export interface AgentDispatch {
  agentName?: AgentName;
  agent_name?: AgentName;
  companyId?: string;
  company_id?: string;
  priority?: "urgent" | "high" | "normal" | "low";
  status?: "queued" | "running" | "completed" | "failed";
  runId?: string;
  run_id?: string;
  startedAt?: string;
  started_at?: string;
  completedAt?: string;
  completed_at?: string;
  tokensUsed?: number;
  tokens_used?: number;
  [key: string]: unknown;
}

// --- Agent Run Record (for DB) ---
export interface AgentRunRecord {
  id?: string;
  agent_name: AgentName;
  trigger_type: TriggerType;
  trigger_source: string;
  company_id?: string;
  status: AgentRunStatus;
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  error_message?: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  total_tokens_used: number;
  total_cost_usd: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  steps_executed: number;
}

// --- Agent Decision Record (for DB) ---
export interface AgentDecisionRecord {
  run_id: string;
  agent_name: AgentName;
  step_name: string;
  decision_type: DecisionType;
  input_summary?: string;
  output_summary?: string;
  confidence?: number;
  model_used?: string;
  tokens_input: number;
  tokens_output: number;
  latency_ms?: number;
  escalated_to_human: boolean;
  human_override?: string;
}

// --- System Health Metrics ---
export interface SystemHealthMetrics {
  lastCycleType?: "full" | "light" | "urgent";
  lastCycleAt?: Date;
  totalDispatches?: number;
  successfulDispatches?: number;
  failedDispatches?: number;
  totalTokensLastCycle?: number;
  avgTokensPerDispatch?: number;
  [key: string]: unknown;
}
