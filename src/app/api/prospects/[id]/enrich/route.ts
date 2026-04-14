import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { enrichProspect } from "@/lib/services/cnpj-enrichment";
import { ProspectService } from "@/lib/services/prospect-service";
import { createSupabaseAdmin } from "@/lib/supabase/server";

/**
 * POST /api/prospects/[id]/enrich — Enrich prospect data from BrasilAPI
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
    const { id } = await params;

    // Verify prospect exists
    const prospect = await ProspectService.getById(id);
    if (!prospect) {
      return NextResponse.json({ error: "Prospect not found" }, { status: 404 });
    }

    if (!prospect.cnpj) {
      return NextResponse.json(
        { error: "Prospect has no CNPJ to enrich" },
        { status: 400 }
      );
    }

    // Enrich the prospect
    const result = await enrichProspect(id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to enrich prospect" },
        { status: 400 }
      );
    }

    // Log audit
    const supabase = createSupabaseAdmin();
    await supabase.from("audit_log").insert({
      user_id: auth!.userId,
      acao: "enriquecer_prospect",
      detalhes: { prospect_id: id, source: "brasilapi" },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    // Fetch updated prospect with activities
    const updatedProspect = await ProspectService.getById(id);
    const activities = await ProspectService.getActivities(id);

    return NextResponse.json({
      ...updatedProspect,
      activities,
    });
  } catch (err) {
    console.error("[PROSPECTS ENRICH]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
