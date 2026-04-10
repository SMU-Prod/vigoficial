import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";

/**
 * GET /api/notifications?limit=20&unread_only=true
 * Returns notifications for the authenticated user.
 */
export async function GET(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100);
  const unreadOnly = searchParams.get("unread_only") === "true";

  const supabase = createSupabaseAdmin();

  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.eq("read", false);
  }

  const { data, error } = await query;

  // Graceful degradation: if table doesn't exist yet, return empty
  if (error) {
    if (error.message?.includes("does not exist") || error.code === "42P01") {
      return NextResponse.json({ notifications: [], unreadCount: 0 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also get unread count
  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.userId)
    .eq("read", false);

  return NextResponse.json({
    notifications: data || [],
    unreadCount: unreadCount || 0,
  });
}

/**
 * PATCH /api/notifications
 * Mark notifications as read.
 * Body: { id: "uuid" } — mark single notification
 * Body: { all: true } — mark all as read
 */
export async function PATCH(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const supabase = createSupabaseAdmin();
  const now = new Date().toISOString();

  if (body.all === true) {
    // Mark all unread as read
    const { error } = await supabase
      .from("notifications")
      .update({ read: true, read_at: now })
      .eq("user_id", auth.userId)
      .eq("read", false);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Todas marcadas como lidas" });
  }

  if (body.id) {
    // Mark single notification as read
    const { error } = await supabase
      .from("notifications")
      .update({ read: true, read_at: now })
      .eq("id", body.id)
      .eq("user_id", auth.userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Forneça 'id' ou 'all: true'" }, { status: 400 });
}

/**
 * DELETE /api/notifications
 * Clear all read notifications for the user.
 */
export async function DELETE(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();

  // Delete only read notifications (safety: don't delete unread)
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", auth.userId)
    .eq("read", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Notificações lidas removidas" });
}
