import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { ProcuracaoService } from "@/lib/services/procuracao-service";
import { createSupabaseAdmin } from "@/lib/supabase/server";

/**
 * GET /api/companies/[id]/procuracao — Returns current procuração status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  try {
    const { id: companyId } = await params;

    // Get current procuração status
    const procuracao = await ProcuracaoService.getByCompany(companyId);

    if (!procuracao) {
      return NextResponse.json(
        { error: "Nenhuma procuração ativa encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(procuracao);
  } catch (err) {
    console.error("[PROCURACAO GET]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * POST /api/companies/[id]/procuracao — Initiates the procuração flow
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
    const { cpfProcurador, nomeProcurador, poderes } = body;

    // Validate required fields
    if (!cpfProcurador || !nomeProcurador) {
      return NextResponse.json(
        { error: "cpfProcurador e nomeProcurador são obrigatórios" },
        { status: 400 }
      );
    }

    // Validate poderes if provided
    if (poderes && !["plenos", "limitados"].includes(poderes)) {
      return NextResponse.json(
        { error: "poderes deve ser 'plenos' ou 'limitados'" },
        { status: 400 }
      );
    }

    // Initiate procuration flow
    const procuracao = await ProcuracaoService.iniciarFluxo({
      companyId,
      cpfProcurador,
      nomeProcurador,
      poderes: poderes || "plenos",
    });

    // Audit log
    const supabase = createSupabaseAdmin();
    await supabase.from("audit_log").insert({
      user_id: auth!.userId,
      acao: "iniciar_procuracao",
      detalhes: {
        company_id: companyId,
        cpf_procurador: cpfProcurador,
        nome_procurador: nomeProcurador,
      },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json(procuracao, { status: 201 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error("[PROCURACAO POST]", err);

    // Handle specific error messages
    if (err.message?.includes("não encontrada")) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err.message?.includes("já existe")) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }

    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
