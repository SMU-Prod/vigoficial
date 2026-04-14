import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { DouScraperService } from "@/lib/services/dou-scraper-service";

/**
 * GET /api/dou/alvaras — Lista alvarás com filtros
 * Query params: cnpj, uf, tipo, search, limit, dataInicio, dataFim
 */
export async function GET(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const cnpj = searchParams.get("cnpj");

    if (cnpj) {
      const alvaras = await DouScraperService.getAlvarasByCnpj(cnpj);
      return NextResponse.json({ success: true, data: alvaras, total: alvaras.length });
    }

    const result = await DouScraperService.getAlvarasRecentes(
      parseInt(searchParams.get("limit") || "50"),
      {
        uf: searchParams.get("uf") || undefined,
        tipo: searchParams.get("tipo") || undefined,
        search: searchParams.get("search") || undefined,
        dataInicio: searchParams.get("dataInicio") || undefined,
        dataFim: searchParams.get("dataFim") || undefined,
        offset: parseInt(searchParams.get("offset") || "0"),
      }
    );

    return NextResponse.json({ success: true, data: result.data, total: result.count });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    );
  }
}
