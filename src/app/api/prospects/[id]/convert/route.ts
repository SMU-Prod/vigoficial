import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { ProspectService } from "@/lib/services/prospect-service";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { notifyProspectConverted } from "@/lib/services/notification-service";

/**
 * POST /api/prospects/[id]/convert — Converte prospect em empresa/cliente
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  try {
    const { id } = await params;
    const body = await request.json();
    const { plano, valor_mensal } = body;

    if (!plano || !valor_mensal) {
      return NextResponse.json(
        { error: "plano e valor_mensal são obrigatórios" },
        { status: 400 }
      );
    }

    const planosValidos = ["essencial", "profissional", "enterprise", "custom"];
    if (!planosValidos.includes(plano)) {
      return NextResponse.json({ error: "Plano inválido" }, { status: 400 });
    }

    const result = await ProspectService.convertToCompany(id, plano, valor_mensal);

    // Notification: prospect converted to company
    notifyProspectConverted(
      "Prospect",
      id,
      result.companyId
    ).catch(() => {});

    // Audit log
    const supabase = createSupabaseAdmin();
    await supabase.from("audit_log").insert({
      user_id: auth!.userId,
      acao: "converter_prospect",
      detalhes: {
        prospect_id: id,
        company_id: result.companyId,
        plano,
        valor_mensal,
      },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[PROSPECT CONVERT]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
