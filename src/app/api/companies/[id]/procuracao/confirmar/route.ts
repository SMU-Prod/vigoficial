import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { ProcuracaoService } from "@/lib/services/procuracao-service";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { notifySystem } from "@/lib/services/notification-service";

/**
 * POST /api/companies/[id]/procuracao/confirmar — Client confirms registration in GESP
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);

  // This endpoint can be called by authenticated users (clients can confirm their own procuration)
  if (!auth) {
    return NextResponse.json(
      { error: "Autenticação necessária" },
      { status: 401 }
    );
  }

  try {
    const { id: companyId } = await params;

    // Get the active procuracao for this company
    const procuracao = await ProcuracaoService.getByCompany(companyId);

    if (!procuracao) {
      return NextResponse.json(
        { error: "Nenhuma procuração ativa encontrada para esta empresa" },
        { status: 404 }
      );
    }

    // Confirm the procuracao
    const updatedProcuracao = await ProcuracaoService.confirmarCliente(
      procuracao.id
    );

    // Audit log
    const supabase = createSupabaseAdmin();
    await supabase.from("audit_log").insert({
      user_id: auth.userId,
      acao: "confirmar_procuracao",
      detalhes: {
        company_id: companyId,
        procuracao_id: procuracao.id,
      },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    notifySystem("Procuração confirmada", "Procuração eletrônica confirmada", "success").catch(() => {});

    return NextResponse.json(updatedProcuracao);
  } catch (err) {
    console.error("[PROCURACAO CONFIRMAR]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
