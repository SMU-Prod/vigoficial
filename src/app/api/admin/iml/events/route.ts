import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { createSupabaseAdmin } from "@/lib/supabase/server";

/**
 * GET /api/admin/iml/events
 * Lista eventos recentes do Event Graph.
 * Query params: ?agent=captador&type=PUBLICACAO_DOU&limit=50
 */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  const roleError = requireRole(auth, "admin");
  if (roleError) return roleError;

  const { searchParams } = request.nextUrl;
  const agent = searchParams.get("agent");
  const eventType = searchParams.get("type");
  const companyId = searchParams.get("company_id");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

  const supabase = createSupabaseAdmin();
  let query = supabase
    .from("iml_events")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (agent) query = query.eq("agent_name", agent);
  if (eventType) query = query.eq("event_type", eventType);
  if (companyId) query = query.eq("company_id", companyId);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Stats
  const { count: totalEvents } = await supabase
    .from("iml_events")
    .select("*", { count: "exact", head: true });

  const { count: totalEdges } = await supabase
    .from("iml_event_edges")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({
    events: data,
    stats: {
      totalEvents: totalEvents || 0,
      totalEdges: totalEdges || 0,
    },
  });
}
