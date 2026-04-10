import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { ProcuracaoService } from "@/lib/services/procuracao-service";
import { createSupabaseAdmin } from "@/lib/supabase/server";

/**
 * POST /api/companies/[id]/procuracao/validar — Operator validates procuration exists in GESP
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
    const { comprovanteR2Path } = body;

    // Get the active procuracao for this company
    const procuracao = await ProcuracaoService.getByCompany(companyId);

    if (!procuracao) {
      return NextResponse.json(
        { error: "Nenhuma procuração ativa encontrada para esta empresa" },
        { status: 404 }
      );
    }

    // Validate the procuration
    const validatedProcuracao = await ProcuracaoService.validar({
      procuracaoId: procuracao.id,
      validadoPor: auth!.userId,
      comprovanteR2Path,
    });

    // Audit log
    const supabase = createSupabaseAdmin();
    await supabase.from("audit_log").insert({
      user_id: auth!.userId,
      acao: "validar_procuracao",
      detalhes: {
        company_id: companyId,
        procuracao_id: procuracao.id,
        comprovante_r2_path: comprovanteR2Path || null,
      },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json(validatedProcuracao);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error("[PROCURACAO VALIDAR]", err);

    // Handle specific error messages
    if (err.message?.includes("não encontrada")) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }

    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
