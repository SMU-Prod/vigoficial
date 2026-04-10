import { createSupabaseAdmin } from "@/lib/supabase/server";

// ============================================================================
// NOTIFICATION SERVICE — Creates real notifications in the database
// Used by all modules: email, workflow, compliance, DOU, GESP, billing, agents
// ============================================================================

export type NotificationType = "info" | "warning" | "success" | "danger";

export type NotificationCategory =
  | "email_sent" | "email_received" | "email_error"
  | "workflow_created" | "workflow_completed" | "workflow_error"
  | "compliance_alert" | "compliance_expiring"
  | "dou_match" | "dou_alert_sent"
  | "gesp_completed" | "gesp_error"
  | "billing_paid" | "billing_overdue" | "billing_created"
  | "prospect_new" | "prospect_converted" | "prospect_reply"
  | "agent_completed" | "agent_error"
  | "fleet_alert"
  | "system";

interface CreateNotificationParams {
  userId: string;
  companyId?: string;
  title: string;
  message: string;
  type: NotificationType;
  category: NotificationCategory;
  relatedType?: string;
  relatedId?: string;
  link?: string;
}

interface BroadcastNotificationParams {
  companyId?: string;
  title: string;
  message: string;
  type: NotificationType;
  category: NotificationCategory;
  relatedType?: string;
  relatedId?: string;
  link?: string;
  roles?: string[]; // If specified, only notify users with these roles
}

/**
 * Creates a notification for a specific user.
 */
export async function createNotification(params: CreateNotificationParams) {
  const supabase = createSupabaseAdmin();

  const { error } = await supabase.from("notifications").insert({
    user_id: params.userId,
    company_id: params.companyId || null,
    title: params.title,
    message: params.message,
    type: params.type,
    category: params.category,
    related_type: params.relatedType || null,
    related_id: params.relatedId || null,
    link: params.link || null,
  });

  if (error) {
    console.error("[NOTIFICATION] Failed to create:", error.message, params);
  }

  return { success: !error };
}

/**
 * Creates a notification for ALL admin/operator users.
 * Used for system-wide events (DOU matches, compliance alerts, etc.)
 */
export async function broadcastNotification(params: BroadcastNotificationParams) {
  const supabase = createSupabaseAdmin();

  // Get all active users (optionally filtered by role)
  let query = supabase
    .from("users")
    .select("id")
    .eq("ativo", true);

  if (params.roles && params.roles.length > 0) {
    query = query.in("role", params.roles);
  }

  const { data: users, error: usersError } = await query;

  if (usersError || !users || users.length === 0) {
    console.error("[NOTIFICATION] No users found for broadcast:", usersError?.message);
    return { success: false, count: 0 };
  }

  // Bulk insert notifications for all users
  const notifications = users.map((user) => ({
    user_id: user.id,
    company_id: params.companyId || null,
    title: params.title,
    message: params.message,
    type: params.type,
    category: params.category,
    related_type: params.relatedType || null,
    related_id: params.relatedId || null,
    link: params.link || null,
  }));

  const { error } = await supabase.from("notifications").insert(notifications);

  if (error) {
    console.error("[NOTIFICATION] Broadcast insert failed:", error.message);
  }

  return { success: !error, count: notifications.length };
}

// ============================================================================
// CONVENIENCE FUNCTIONS — One-liners for common notification patterns
// ============================================================================

/** Email enviado com sucesso */
export function notifyEmailSent(userId: string, to: string, subject: string, companyId?: string) {
  return broadcastNotification({
    companyId,
    title: "Email enviado",
    message: `Email "${subject}" enviado para ${to}`,
    type: "success",
    category: "email_sent",
    relatedType: "email_outbound",
    roles: ["admin", "operator"],
  });
}

/** Email recebido (inbound) */
export function notifyEmailReceived(from: string, subject: string, companyId?: string, threadId?: string) {
  return broadcastNotification({
    companyId,
    title: "Novo email recebido",
    message: `De: ${from} — "${subject}"`,
    type: "info",
    category: "email_received",
    relatedType: "email_thread",
    relatedId: threadId,
    link: threadId ? `/meus-threads` : undefined,
    roles: ["admin", "operator"],
  });
}

/** Erro ao enviar email */
export function notifyEmailError(to: string, subject: string, error: string, companyId?: string) {
  return broadcastNotification({
    companyId,
    title: "Falha no envio de email",
    message: `Erro ao enviar "${subject}" para ${to}: ${error}`,
    type: "danger",
    category: "email_error",
    roles: ["admin"],
  });
}

/** Workflow criado */
export function notifyWorkflowCreated(tipo: string, companyName: string, companyId: string, workflowId: string) {
  return broadcastNotification({
    companyId,
    title: "Novo workflow criado",
    message: `${tipo} — ${companyName}`,
    type: "info",
    category: "workflow_created",
    relatedType: "email_workflow",
    relatedId: workflowId,
    link: `/minhas-tarefas`,
    roles: ["admin", "operator"],
  });
}

/** Workflow concluído */
export function notifyWorkflowCompleted(tipo: string, companyName: string, companyId: string) {
  return broadcastNotification({
    companyId,
    title: "Workflow concluído",
    message: `${tipo} — ${companyName} finalizado com sucesso`,
    type: "success",
    category: "workflow_completed",
    roles: ["admin", "operator"],
  });
}

/** Workflow com erro */
export function notifyWorkflowError(tipo: string, companyName: string, error: string, companyId: string) {
  return broadcastNotification({
    companyId,
    title: "Erro no workflow",
    message: `${tipo} — ${companyName}: ${error}`,
    type: "danger",
    category: "workflow_error",
    link: `/minhas-tarefas`,
    roles: ["admin"],
  });
}

/** Alerta de compliance — documento expirando */
export function notifyComplianceExpiring(companyName: string, document: string, daysLeft: number, companyId: string) {
  return broadcastNotification({
    companyId,
    title: `Documento expirando em ${daysLeft} dias`,
    message: `${companyName} — ${document}`,
    type: daysLeft <= 7 ? "danger" : "warning",
    category: "compliance_expiring",
    relatedType: "company",
    relatedId: companyId,
    link: `/empresas`,
    roles: ["admin", "operator"],
  });
}

/** Alerta de compliance genérico */
export function notifyComplianceAlert(companyName: string, alert: string, companyId: string) {
  return broadcastNotification({
    companyId,
    title: "Alerta de compliance",
    message: `${companyName} — ${alert}`,
    type: "warning",
    category: "compliance_alert",
    relatedType: "company",
    relatedId: companyId,
    link: `/empresas`,
    roles: ["admin", "operator"],
  });
}

/** Match no DOU */
export function notifyDouMatch(companyName: string, ato: string, companyId?: string) {
  return broadcastNotification({
    companyId,
    title: "Publicação encontrada no DOU",
    message: `${companyName} — ${ato}`,
    type: "info",
    category: "dou_match",
    link: `/inteligencia-dou`,
    roles: ["admin", "operator"],
  });
}

/** Alerta DOU enviado por email */
export function notifyDouAlertSent(count: number) {
  return broadcastNotification({
    title: "Alertas DOU enviados",
    message: `${count} alerta(s) de publicação DOU enviados por email`,
    type: "success",
    category: "dou_alert_sent",
    link: `/inteligencia-dou`,
    roles: ["admin"],
  });
}

/** GESP task concluída */
export function notifyGespCompleted(companyName: string, taskType: string, companyId: string) {
  return broadcastNotification({
    companyId,
    title: "GESP concluído",
    message: `${taskType} — ${companyName} processado com sucesso`,
    type: "success",
    category: "gesp_completed",
    relatedType: "company",
    relatedId: companyId,
    link: `/empresas`,
    roles: ["admin", "operator"],
  });
}

/** GESP erro */
export function notifyGespError(companyName: string, error: string, companyId: string) {
  return broadcastNotification({
    companyId,
    title: "Erro no GESP",
    message: `${companyName}: ${error}`,
    type: "danger",
    category: "gesp_error",
    link: `/empresas`,
    roles: ["admin"],
  });
}

/** Billing — pagamento recebido */
export function notifyBillingPaid(companyName: string, valor: string, companyId: string) {
  return broadcastNotification({
    companyId,
    title: "Pagamento confirmado",
    message: `${companyName} — ${valor}`,
    type: "success",
    category: "billing_paid",
    link: `/financeiro`,
    roles: ["admin"],
  });
}

/** Billing — cobrança em atraso */
export function notifyBillingOverdue(companyName: string, valor: string, diasAtraso: number, companyId: string) {
  return broadcastNotification({
    companyId,
    title: `Cobrança em atraso (${diasAtraso}d)`,
    message: `${companyName} — ${valor}`,
    type: "danger",
    category: "billing_overdue",
    link: `/financeiro`,
    roles: ["admin"],
  });
}

/** Novo prospect detectado */
export function notifyProspectNew(razaoSocial: string, fonte: string, prospectId: string) {
  return broadcastNotification({
    title: "Novo prospect identificado",
    message: `${razaoSocial} — via ${fonte}`,
    type: "info",
    category: "prospect_new",
    relatedType: "prospect",
    relatedId: prospectId,
    link: `/prospeccao`,
    roles: ["admin", "operator"],
  });
}

/** Prospect convertido em empresa */
export function notifyProspectConverted(razaoSocial: string, prospectId: string, companyId: string) {
  return broadcastNotification({
    companyId,
    title: "Prospect convertido",
    message: `${razaoSocial} agora é cliente!`,
    type: "success",
    category: "prospect_converted",
    relatedType: "company",
    relatedId: companyId,
    link: `/empresas`,
    roles: ["admin", "operator"],
  });
}

/** Prospect respondeu email */
export function notifyProspectReply(razaoSocial: string, subject: string, prospectId: string) {
  return broadcastNotification({
    title: "Resposta de prospect",
    message: `${razaoSocial} respondeu: "${subject}"`,
    type: "info",
    category: "prospect_reply",
    relatedType: "prospect",
    relatedId: prospectId,
    link: `/prospeccao`,
    roles: ["admin", "operator"],
  });
}

/** Agent run concluído */
export function notifyAgentCompleted(agentName: string, result: string) {
  return broadcastNotification({
    title: `Agente ${agentName} concluído`,
    message: result,
    type: "success",
    category: "agent_completed",
    link: `/monitoramento`,
    roles: ["admin"],
  });
}

/** Agent run com erro */
export function notifyAgentError(agentName: string, error: string) {
  return broadcastNotification({
    title: `Erro no agente ${agentName}`,
    message: error,
    type: "danger",
    category: "agent_error",
    link: `/monitoramento`,
    roles: ["admin"],
  });
}

/** Alerta de frota */
export function notifyFleetAlert(plate: string, alert: string) {
  return broadcastNotification({
    title: "Alerta de frota",
    message: `${plate} — ${alert}`,
    type: "warning",
    category: "fleet_alert",
    link: `/frota`,
    roles: ["admin", "operator"],
  });
}

/** Notificação de sistema genérica */
export function notifySystem(title: string, message: string, type: NotificationType = "info") {
  return broadcastNotification({
    title,
    message,
    type,
    category: "system",
    roles: ["admin"],
  });
}
