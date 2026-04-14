import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { ProspectService } from "@/lib/services/prospect-service";
import { createSupabaseAdmin } from "@/lib/supabase/server";

/**
 * POST /api/prospects/import — Importa prospects em lote (CSV parseado)
 * Body: { prospects: Array<ProspectData> }
 */
export async function POST(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  try {
    const body = await request.json();
    const { prospects } = body;

    if (!Array.isArray(prospects) || prospects.length === 0) {
      return NextResponse.json(
        { error: "Array de prospects obrigatório" },
        { status: 400 }
      );
    }

    if (prospects.length > 20000) {
      return NextResponse.json(
        { error: "Máximo de 20.000 prospects por importação" },
        { status: 400 }
      );
    }

    const result = await ProspectService.bulkImport(prospects, auth!.userId);

    // Audit log
    const supabase = createSupabaseAdmin();
    await supabase.from("audit_log").insert({
      user_id: auth!.userId,
      acao: "importar_prospects",
      detalhes: {
        total_enviado: prospects.length,
        importados: result.imported,
        duplicados: result.duplicates,
        erros: result.errors,
      },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("[PROSPECT IMPORT]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
