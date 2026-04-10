import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { getPendingInsights, approveInsightToPlaybook, rejectInsight } from "@/lib/iml";

const insightActionSchema = z.object({
  insightId: z.string().uuid("insightId deve ser UUID válido"),
  action: z.enum(["approve", "reject"], { message: "action deve ser 'approve' ou 'reject'" }),
  notes: z.string().max(2000).optional(),
});

/**
 * GET /api/admin/iml/insights
 * Lista insights pendentes de aprovação do admin.
 */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  const roleError = requireRole(auth, "admin");
  if (roleError) return roleError;

  const insights = await getPendingInsights(50);
  return NextResponse.json({ insights });
}

/**
 * POST /api/admin/iml/insights
 * Aprova ou rejeita um insight.
 * Body: { insightId, action: "approve" | "reject", notes? }
 */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  const roleError = requireRole(auth, "admin");
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const parsed = insightActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  const { insightId, action, notes } = parsed.data;

  if (action === "approve") {
    const result = await approveInsightToPlaybook(insightId, auth!.userId, notes);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, playbookRuleId: result.playbookRuleId });
  }

  // action === "reject"
  await rejectInsight(insightId, auth!.userId, notes);
  return NextResponse.json({ ok: true });
}
