import { google } from "googleapis";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { uploadToR2 } from "@/lib/r2/client";
import { env } from "@/lib/config/env"; // OPS-02

const oauth2Client = new google.auth.OAuth2(
  env.GMAIL_CLIENT_ID,
  env.GMAIL_CLIENT_SECRET
);

oauth2Client.setCredentials({
  refresh_token: env.GMAIL_REFRESH_TOKEN,
});

const gmail = google.gmail({ version: "v1", auth: oauth2Client });

interface InboundEmail {
  gmail_message_id: string;
  from_email: string;
  to_email: string;
  subject: string;
  body_text: string;
  body_html: string | null;
  received_at: string;
  attachments: { filename: string; mime: string; r2_path: string; size: number }[];
}

/**
 * Lê emails não lidos da inbox
 * PRD Regra R2: Email salvo IMEDIATAMENTE, ANTES de qualquer processamento
 */
export async function readNewEmails(): Promise<InboundEmail[]> {
  const response = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread",
    maxResults: 50,
  });

  const messages = response.data.messages || [];
  const emails: InboundEmail[] = [];

  for (const msg of messages) {
    try {
      const full = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "full",
      });

      const headers = full.data.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

      const fromRaw = getHeader("from");
      const fromEmail = fromRaw.match(/<(.+?)>/)?.[1] || fromRaw;

      // Extrai corpo
      const { text, html } = extractBody(full.data.payload || {});

      // Processa attachments
      const attachments = await processAttachments(
        msg.id!,
        full.data.payload || {}
      );

      emails.push({
        gmail_message_id: msg.id!,
        from_email: fromEmail,
        to_email: getHeader("to"),
        subject: getHeader("subject"),
        body_text: text || "",
        body_html: html || null,
        received_at: new Date(
          parseInt(full.data.internalDate || "0")
        ).toISOString(),
        attachments,
      });

      // Marca como lido
      await gmail.users.messages.modify({
        userId: "me",
        id: msg.id!,
        requestBody: {
          removeLabelIds: ["UNREAD"],
        },
      });
    } catch (err) {
      console.error(`[GMAIL] Erro ao ler mensagem ${msg.id}:`, err);
    }
  }

  return emails;
}

/**
 * Salva emails no banco imediatamente (Regra R2)
 */
export async function saveInboundEmails(
  emails: InboundEmail[],
  companyId: string | null
) {
  const supabase = createSupabaseAdmin();
  const saved = [];

  for (const email of emails) {
    // Verifica se já foi salvo (idempotencia)
    const { data: existing } = await supabase
      .from("email_inbound")
      .select("id")
      .eq("gmail_message_id", email.gmail_message_id)
      .single();

    if (existing) continue;

    const { data, error } = await supabase
      .from("email_inbound")
      .insert({
        company_id: companyId,
        gmail_message_id: email.gmail_message_id,
        from_email: email.from_email,
        to_email: email.to_email,
        subject: email.subject,
        body_text: email.body_text,
        body_html: email.body_html,
        attachments: email.attachments,
        received_at: email.received_at,
        status: "recebido",
      })
      .select()
      .single();

    if (!error && data) {
      saved.push(data);
    }
  }

  return saved;
}

// --- Helpers ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBody(payload: Record<string, any>): { text: string; html: string } {
  let text = "";
  let html = "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(part: Record<string, any>) {
    if (!part) return;

    if (part.mimeType === "text/plain" && part.body?.data) {
      text += Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
    if (part.mimeType === "text/html" && part.body?.data) {
      html += Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
    if (part.parts) {
      for (const sub of part.parts) walk(sub);
    }
  }

  walk(payload);
  return { text, html };
}

async function processAttachments(
  messageId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>
): Promise<{ filename: string; mime: string; r2_path: string; size: number }[]> {
  const attachments: { filename: string; mime: string; r2_path: string; size: number }[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function walk(part: Record<string, any>) {
    if (!part) return;

    if (part.filename && part.body?.attachmentId) {
      try {
        const att = await gmail.users.messages.attachments.get({
          userId: "me",
          messageId,
          id: part.body.attachmentId,
        });

        if (att.data.data) {
          const buffer = Buffer.from(att.data.data, "base64url");
          const key = `emails/attachments/${messageId}/${part.filename}`;
          await uploadToR2(key, buffer, part.mimeType || "application/octet-stream");

          attachments.push({
            filename: part.filename,
            mime: part.mimeType || "application/octet-stream",
            r2_path: key,
            size: buffer.length,
          });
        }
      } catch (err) {
        console.error(`[GMAIL] Erro ao baixar attachment ${part.filename}:`, err);
      }
    }

    if (part.parts) {
      for (const sub of part.parts) await walk(sub);
    }
  }

  await walk(payload);
  return attachments;
}
