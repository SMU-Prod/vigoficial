import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { requestDataExport } from "@/lib/lgpd/compliance";
import { z } from "zod";

const exportSchema = z.object({
  companyId: z.string().uuid("ID da empresa inválido"),
});

type ExportInput = z.infer<typeof exportSchema>;

export async function POST(request: NextRequest) {
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  try {
    const body = await request.json();

    // Validate request
    const validationResult = exportSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Dados inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data: ExportInput = validationResult.data;

    // Verify company access
    if (auth!.role !== "admin" && !auth!.companyIds.includes(data.companyId)) {
      return NextResponse.json(
        { error: "Sem permissão para acessar esta empresa" },
        { status: 403 }
      );
    }

    // Generate data export
    const downloadUrl = await requestDataExport(data.companyId, auth!.userId);

    return NextResponse.json({
      success: true,
      message: "Exportação de dados solicitada com sucesso",
      downloadUrl,
      expires_in_hours: 24,
    });
  } catch (error: unknown) {
    console.error("[LGPD EXPORT]", error);
    return NextResponse.json({ error: "Erro ao processar solicitação de exportação" }, { status: 500 });
  }
}
