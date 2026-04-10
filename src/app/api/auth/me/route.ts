import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth/middleware";

/**
 * GET /api/auth/me
 * Retorna dados do usuário autenticado extraídos do JWT.
 * Essencial para o frontend saber role, email, companyIds.
 */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);

  if (!auth) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  return NextResponse.json({
    userId: auth.userId,
    email: auth.email,
    role: auth.role,
    companyIds: auth.companyIds,
  });
}
