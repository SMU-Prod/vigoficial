import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { ProcuracaoService } from "@/lib/services/procuracao-service";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { notifySystem } from "@/lib/services/notification-service";

/**
 * POST /api/companies/[id]/procuracao/rejeitar — Reject procuration (not found in GESP)
 * Requires auth with role 'admin' or 'operador'
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "operador");
  if (denied) return denied;

  try {
    const { id: companyId } = await params;
    const body = await request.json();
    const { motivo } = body;

    // Validate required fields
    if (!motivo) {
      return NextResponse.json(
        { error: "motivo é obrigatório" },
        { status: 400 }
      );
    }

    // Get the active procuracao for this company
    const procuracao = await ProcuracaoService.getByCompany(companyId);

    if (!procuracao) {
      return NextResponse.json(
        { error: "Nenhuma procuração ativa encontrada para esta empresa" },
        { status: 404 }
      );
    }

    // Reject the procuration
    const rejectedProcuracao = await ProcuracaoService.rejeitar({
      procuracaoId: procuracao.id,
      motivo,
    });

    // Audit log
    const supabase = createSupabaseAdmin();
    await supabase.from("audit_log").insert({
      user_id: auth!.userId,
      acao: "rejeitar_procuracao",
      detalhes: {
        company_id: companyId,
        procuracao_id: procuracao.id,
        motivo,
      },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    notifySystem("Procuração rejeitada", "Procuração eletrônica rejeitada", "warning").catch(() => {});

    return NextResponse.json(rejectedProcuracao);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error("[PROCURACAO REJEITAR]", err);

    // Handle specific error messages
    if (err.message?.includes("não encontrada")) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }

    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
