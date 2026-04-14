import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { validateBody, prospectActivitySchema } from "@/lib/validation/schemas";
import { ProspectService } from "@/lib/services/prospect-service";

/**
 * GET /api/prospects/[id]/activities — Lista atividades do prospect
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

  try {
    const { id } = await params;
    const activities = await ProspectService.getActivities(id);
    return NextResponse.json(activities);
  } catch (err) {
    console.error("[PROSPECT ACTIVITIES GET]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * POST /api/prospects/[id]/activities — Registra nova atividade
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
    const { data: parsed, error: validationError } = await validateBody(request, prospectActivitySchema);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedData = parsed as any;

    const activity = await ProspectService.addActivity({
      prospect_id: id,
      user_id: auth!.userId,
      tipo: typedData.tipo,
      descricao: typedData.descricao,
      resultado: typedData.resultado,
    });

    return NextResponse.json(activity, { status: 201 });
  } catch (err) {
    console.error("[PROSPECT ACTIVITIES POST]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
