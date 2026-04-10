import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole, canAccessCompany } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";

/**
 * GET /api/threads/[id]/participants — Lista participantes do thread
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  const supabase = createSupabaseAdmin();

  // Fetch thread to check access
  const { data: thread, error: threadError } = await supabase
    .from("threads")
    .select("company_id")
    .eq("id", id)
    .single();

  if (threadError || !thread) {
    return NextResponse.json(
      { error: "Thread não encontrado" },
      { status: 404 }
    );
  }

  if (!canAccessCompany(auth!, thread.company_id)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Fetch participants
  const { data: participants, error: participantsError } = await supabase
    .from("thread_participants")
    .select("id, user_id, ativo, created_at")
    .eq("thread_id", id);

  if (participantsError) {
    return NextResponse.json(
      { error: participantsError.message },
      { status: 500 }
    );
  }

  return NextResponse.json(participants || []);
}
