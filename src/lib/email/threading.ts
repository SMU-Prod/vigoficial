import { createSupabaseAdmin } from "@/lib/supabase/server";
import {
  EmailThread,
  ThreadParticipant,
  ThreadStatus,
  ThreadParticipantTipo,
  ThreadParticipantMotivo,
} from "@/types/database";

const EXCLUDED_EMAILS = [
  "admin@vigconsultoria.com",
  "vigipro@vigconsultoria.com",
  "atendimento@vigconsultoria.com",
];

const INTERNAL_DOMAIN = "@vigconsultoria.com";

function isValidEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.toLowerCase());
}

function isAdmin(email: string): boolean {
  return email.toLowerCase().startsWith("admin@");
}

function isInternalVigi(email: string): boolean {
  return email.toLowerCase().endsWith(INTERNAL_DOMAIN);
}

function hasCnpj(email: string): boolean {
  return /\d{11,}/.test(email);
}

export function normalizeSubject(subject: string): string {
  let normalized = subject.trim();
  const prefixes = /^(Re:|Fwd:|RE:|FW:|Enc:|RES:)\s*/i;

  while (prefixes.test(normalized)) {
    normalized = normalized.replace(prefixes, "").trim();
  }

  return normalized;
}

export async function findOrCreateThread(params: {
  companyId: string;
  subject: string;
  cnpjDetectado?: string;
  messageId?: string;
  inReplyTo?: string;
}): Promise<EmailThread> {
  const supabase = createSupabaseAdmin();
  const normalizedSubject = normalizeSubject(params.subject);

  // Try to find by inReplyTo matching message_ids
  if (params.inReplyTo) {
    const { data: threadByReplyTo } = await supabase
      .from("email_threads")
      .select("*")
      .eq("company_id", params.companyId)
      .contains("message_ids", [params.inReplyTo])
      .single();

    if (threadByReplyTo) {
      // Update existing thread
      const messageIds = threadByReplyTo.message_ids || [];
      if (params.messageId && !messageIds.includes(params.messageId)) {
        messageIds.push(params.messageId);
      }

      await supabase
        .from("email_threads")
        .update({
          updated_at: new Date().toISOString(),
          message_ids: messageIds,
          last_message_id: params.messageId || threadByReplyTo.last_message_id,
        })
        .eq("id", threadByReplyTo.id);

      return {
        ...threadByReplyTo,
        message_ids: messageIds,
        last_message_id: params.messageId || threadByReplyTo.last_message_id,
        updated_at: new Date().toISOString(),
      };
    }
  }

  // Try to find by company + normalized subject
  const { data: threadBySubject } = await supabase
    .from("email_threads")
    .select("*")
    .eq("company_id", params.companyId)
    .eq("subject", normalizedSubject)
    .single();

  if (threadBySubject) {
    // Update existing thread
    const messageIds = threadBySubject.message_ids || [];
    if (params.messageId && !messageIds.includes(params.messageId)) {
      messageIds.push(params.messageId);
    }

    await supabase
      .from("email_threads")
      .update({
        updated_at: new Date().toISOString(),
        message_ids: messageIds,
        last_message_id: params.messageId || threadBySubject.last_message_id,
      })
      .eq("id", threadBySubject.id);

    return {
      ...threadBySubject,
      message_ids: messageIds,
      last_message_id: params.messageId || threadBySubject.last_message_id,
      updated_at: new Date().toISOString(),
    };
  }

  // Create new thread
  const messageIds = params.messageId ? [params.messageId] : [];

  const { data: newThread, error } = await supabase
    .from("email_threads")
    .insert({
      company_id: params.companyId,
      subject: normalizedSubject,
      cnpj_detectado: params.cnpjDetectado || null,
      status: "PENDENTE" as ThreadStatus,
      message_ids: messageIds,
      last_message_id: params.messageId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create thread: ${error.message}`);
  }

  return newThread;
}

export async function addParticipant(params: {
  threadId: string;
  email: string;
  userId?: string;
  tipo: ThreadParticipantTipo;
  motivoEntrada: ThreadParticipantMotivo;
}): Promise<void> {
  const supabase = createSupabaseAdmin();

  // Check if participant already exists
  const { data: existing } = await supabase
    .from("thread_participants")
    .select("id")
    .eq("thread_id", params.threadId)
    .eq("email", params.email.toLowerCase())
    .single();

  if (existing) {
    return; // Already exists, do nothing
  }

  const { error } = await supabase.from("thread_participants").insert({
    thread_id: params.threadId,
    user_id: params.userId || null,
    email: params.email.toLowerCase(),
    tipo: params.tipo,
    motivo_entrada: params.motivoEntrada,
    entrou_em: new Date().toISOString(),
    ativo: true,
  });

  if (error) {
    throw new Error(`Failed to add participant: ${error.message}`);
  }
}

export async function getActiveParticipants(
  threadId: string
): Promise<ThreadParticipant[]> {
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from("thread_participants")
    .select("*")
    .eq("thread_id", threadId)
    .eq("ativo", true);

  if (error) {
    throw new Error(`Failed to fetch participants: ${error.message}`);
  }

  return data || [];
}

export async function extractAndAddParticipants(params: {
  threadId: string;
  from: string;
  to: string[];
  cc: string[];
}): Promise<void> {
  const allEmails = [params.from, ...params.to, ...params.cc];
  const uniqueEmails = Array.from(new Set(allEmails.map((e) => e.toLowerCase())));

  for (const email of uniqueEmails) {
    if (!isValidEmail(email)) {
      continue;
    }

    let tipo: ThreadParticipantTipo;
    let motivo: ThreadParticipantMotivo;

    if (isAdmin(email)) {
      tipo = "interno_admin";
      motivo = "interveio";
    } else if (isInternalVigi(email)) {
      tipo = "interno_operador";
      motivo = "interveio";
    } else if (hasCnpj(email)) {
      tipo = "externo_cnpj";
      motivo = params.cc.includes(email) ? "cliente_copiou" : "responsavel_empresa";
    } else {
      tipo = "externo_outro";
      motivo = params.cc.includes(email) ? "cliente_copiou" : "responsavel_empresa";
    }

    await addParticipant({
      threadId: params.threadId,
      email,
      tipo,
      motivoEntrada: motivo,
    });
  }
}

export async function buildReplyRecipients(
  threadId: string
): Promise<{
  to: string;
  cc: string[];
}> {
  const participants = await getActiveParticipants(threadId);

  const clientEmail = participants.find((p) => p.tipo === "externo_cnpj")?.email;

  if (!clientEmail) {
    throw new Error("No external CNPJ participant found for reply-all");
  }

  const ccEmails = participants
    .filter((p) => p.email !== clientEmail)
    .map((p) => p.email)
    .filter((email) => !EXCLUDED_EMAILS.includes(email));

  return {
    to: clientEmail,
    cc: ccEmails,
  };
}

export async function finalizeThread(
  threadId: string,
  userId: string
): Promise<void> {
  const supabase = createSupabaseAdmin();
  const now = new Date().toISOString();

  // Update thread status
  await supabase
    .from("email_threads")
    .update({
      status: "FINALIZADO" as ThreadStatus,
      finalizado_at: now,
      finalizado_por: userId,
    })
    .eq("id", threadId);

  // Set all participants as inactive
  await supabase
    .from("thread_participants")
    .update({ ativo: false })
    .eq("thread_id", threadId);
}
