import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";

/**
 * GET /api/emails/by-recipient?email=x@y.com&limit=50
 * Returns all emails sent to/from a specific email address.
 * Used in prospect detail drawer to show email history.
 */
export async function GET(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "operador");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

  if (!email) {
    return NextResponse.json({ error: "Parâmetro 'email' é obrigatório" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  // Get outbound emails (sent TO this email)
  const { data: outbound, error: outError } = await supabase
    .from("email_outbound")
    .select("id, template_id, mode, from_email, to_email, subject, status, erro_detalhe, created_at, sent_at, opened_at, clicked_at, thread_id")
    .eq("to_email", email)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Get inbound emails (FROM this email)
  const { data: inbound, error: inError } = await supabase
    .from("email_inbound")
    .select("id, from_email, to_email, subject, body_text, status, tipo_demanda, received_at, thread_id")
    .eq("from_email", email)
    .order("received_at", { ascending: false })
    .limit(limit);

  if (outError || inError) {
    return NextResponse.json({ error: outError?.message || inError?.message }, { status: 500 });
  }

  // Merge and sort by date
  const allEmails = [
    ...(outbound || []).map((e) => ({
      ...e,
      direction: "outbound" as const,
      date: e.sent_at || e.created_at,
    })),
    ...(inbound || []).map((e) => ({
      ...e,
      direction: "inbound" as const,
      date: e.received_at,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json({
    emails: allEmails,
    stats: {
      total: allEmails.length,
      sent: (outbound || []).filter((e) => e.status === "enviado").length,
      pending: (outbound || []).filter((e) => e.status === "pendente").length,
      errors: (outbound || []).filter((e) => e.status === "erro").length,
      received: (inbound || []).length,
      opened: (outbound || []).filter((e) => e.opened_at).length,
    },
  });
}
