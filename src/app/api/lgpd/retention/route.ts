import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole, canAccessCompany } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { getDataRetentionReport } from "@/lib/lgpd/compliance";

export async function GET(request: NextRequest) {
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId é obrigatório" },
        { status: 400 }
      );
    }

    // Verify company access
    if (!canAccessCompany(auth!, companyId)) {
      return NextResponse.json(
        { error: "Sem permissão para acessar esta empresa" },
        { status: 403 }
      );
    }

    // Get retention report
    const report = await getDataRetentionReport(companyId);

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error: unknown) {
    console.error("[LGPD RETENTION]", error);
    return NextResponse.json(
      { error: "Erro ao gerar relatório de retenção" },
      { status: 500 }
    );
  }
}
