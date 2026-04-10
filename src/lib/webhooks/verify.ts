import { Resend } from "resend";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { env } from "@/lib/config/env"; // OPS-02

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(env.RESEND_API_KEY);
  }
  return _resend;
}

export interface SvixHeaders {
  "svix-id": string;
  "svix-timestamp": string;
  "svix-signature": string;
}

export function extractSvixHeaders(req: Request): SvixHeaders {
  return {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };
}

/**
 * Verifica assinatura Svix do webhook Resend
 * CRITICO: Usar body RAW (texto), nunca JSON parseado
 */
export function verifyResendWebhook(payload: string, headers: SvixHeaders) {
  const secret = env.RESEND_WEBHOOK_SECRET;
  if (!secret) throw new Error("RESEND_WEBHOOK_SECRET não configurada.");

  const resend = getResend();
  return resend.webhooks.verify({
    payload,
    headers: {
      id: headers["svix-id"],
      timestamp: headers["svix-timestamp"],
      signature: headers["svix-signature"],
    },
    webhookSecret: secret,
  });
}

/**
 * Verifica se webhook já foi processado (idempotência)
 */
export async function isWebhookProcessed(svixId: string): Promise<boolean> {
  const supabase = createSupabaseAdmin();
  const { data } = await supabase
    .from("webhook_processed")
    .select("svix_id")
    .eq("svix_id", svixId)
    .single();
  return !!data;
}

/**
 * Marca webhook como processado
 */
export async function markWebhookProcessed(
  svixId: string,
  endpoint: string
): Promise<void> {
  const supabase = createSupabaseAdmin();
  await supabase.from("webhook_processed").upsert({
    svix_id: svixId,
    endpoint,
    processed_at: new Date().toISOString(),
  });
}
