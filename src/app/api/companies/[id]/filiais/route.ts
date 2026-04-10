import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole, canAccessCompany } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";

/**
 * GET /api/companies/[id]/filiais — Lista filiais de uma empresa matriz
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  const { id } = await params;

  if (!canAccessCompany(auth!, id)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .eq("matriz_id", id)
    .order("razao_social");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
