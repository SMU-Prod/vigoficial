import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";

export async function GET(request: NextRequest) {
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  try {
    const supabase = createSupabaseAdmin();

    // Get all vehicles for authorized companies with GPS data
    let query = supabase
      .from("vehicles")
      .select("id, placa, modelo, status, gps_ultimo_lat, gps_ultimo_lng, gps_ultima_leitura, licenciamento_validade, seguro_validade");

    // Filter by company if user is not admin
    if (auth!.role !== "admin") {
      query = query.in("company_id", auth!.companyIds);
    }

    const { data: vehicles, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform to positions format
    const positions = (vehicles || [])
      .filter((v) => v.gps_ultimo_lat && v.gps_ultimo_lng)
      .map((v) => {
        // Determine status: check if documents are expired
        let status = "ativo";

        if (v.status !== "ativo") {
          status = "inactive";
        } else {
          const now = new Date();
          const licDate = v.licenciamento_validade ? new Date(v.licenciamento_validade) : null;
          const segDate = v.seguro_validade ? new Date(v.seguro_validade) : null;

          if ((licDate && licDate < now) || (segDate && segDate < now)) {
            status = "docs_vencidos";
          }
        }

        return {
          id: v.id,
          placa: v.placa,
          modelo: v.modelo,
          status,
          lat: v.gps_ultimo_lat,
          lng: v.gps_ultimo_lng,
          last_update: v.gps_ultima_leitura || new Date().toISOString(),
        };
      });

    return NextResponse.json({ vehicles: positions });
  } catch (err: unknown) {
    console.error("[FLEET POSITIONS GET]", err);
    return NextResponse.json({ error: "Erro ao buscar posições GPS" }, { status: 500 });
  }
}
