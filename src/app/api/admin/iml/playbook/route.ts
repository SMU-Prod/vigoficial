import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { deactivatePlaybookRule } from "@/lib/iml";
import { createSupabaseAdmin } from "@/lib/supabase/server";

const playbookActionSchema = z.object({
  ruleId: z.string().uuid("ruleId deve ser UUID válido"),
  action: z.literal("deactivate", { message: "action deve ser 'deactivate'" }),
});

/**
 * GET /api/admin/iml/playbook
 * Lista regras ativas do Adaptive Playbook.
 */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  const roleError = requireRole(auth, "admin");
  if (roleError) return roleError;

  const supabase = createSupabaseAdmin();

  const { data: rules, error } = await supabase
    .from("iml_playbook_rules")
    .select(`
      *,
      insight:iml_insights(title, confidence, insight_type)
    `)
    .order("active", { ascending: false })
    .order("times_applied", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Stats
  const activeCount = rules?.filter((r) => r.active).length || 0;
  const totalApplications = rules?.reduce((sum, r) => sum + (r.times_applied || 0), 0) || 0;

  return NextResponse.json({
    rules,
    stats: {
      totalRules: rules?.length || 0,
      activeRules: activeCount,
      totalApplications,
    },
  });
}

/**
 * POST /api/admin/iml/playbook
 * Desativa uma regra do Playbook.
 * Body: { ruleId, action: "deactivate" }
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

  const parsed = playbookActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  await deactivatePlaybookRule(parsed.data.ruleId);
  return NextResponse.json({ ok: true });
}
