import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAllQueues } from "@/lib/queue/queues";

/**
 * GET /api/admin/metrics
 *
 * Dashboard de métricas do sistema — dados para visualização admin.
 * Combina: queue stats, event counts, billing health, email health.
 */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  const roleError = requireRole(auth, "admin");
  if (roleError) return roleError;

  const supabase = createSupabaseAdmin();
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const _last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Parallel queries
  const [
    emailOutbound24h,
    emailErrors24h,
    emailInbound24h,
    gespTasks24h,
    gespErrors24h,
    systemEvents24h,
    activeCompanies,
    billingPending,
    queueStats,
  ] = await Promise.all([
    // Email outbound stats
    supabase
      .from("email_outbound")
      .select("*", { count: "exact", head: true })
      .gte("created_at", last24h),

    // Email errors
    supabase
      .from("email_outbound")
      .select("*", { count: "exact", head: true })
      .eq("status", "erro")
      .gte("created_at", last24h),

    // Email inbound
    supabase
      .from("email_inbound")
      .select("*", { count: "exact", head: true })
      .gte("created_at", last24h),

    // GESP tasks
    supabase
      .from("gesp_tasks")
      .select("*", { count: "exact", head: true })
      .gte("created_at", last24h),

    // GESP errors
    supabase
      .from("gesp_tasks")
      .select("*", { count: "exact", head: true })
      .eq("status", "erro")
      .gte("created_at", last24h),

    // System events
    supabase
      .from("system_events")
      .select("tipo, severidade, created_at")
      .gte("created_at", last24h)
      .order("created_at", { ascending: false })
      .limit(50),

    // Active companies
    supabase
      .from("companies")
      .select("*", { count: "exact", head: true })
      .eq("habilitada", true),

    // Pending billing
    supabase
      .from("billing_history")
      .select("*", { count: "exact", head: true })
      .eq("status", "pendente"),

    // Queue stats
    (async () => {
      try {
        const queues = getAllQueues();
        const stats = await Promise.all(
          queues.map(async (q) => {
            try {
              const [waiting, active, completed, failed, delayed] = await Promise.all([
                q.getWaitingCount(),
                q.getActiveCount(),
                q.getCompletedCount(),
                q.getFailedCount(),
                q.getDelayedCount(),
              ]);
              return { name: q.name, waiting, active, completed, failed, delayed };
            } catch {
              return { name: q.name, error: "unavailable" };
            }
          })
        );
        return stats;
      } catch {
        return [];
      }
    })(),
  ]);

  // Aggregate system events by severity
  const eventsBySeverity: Record<string, number> = {};
  for (const evt of systemEvents24h.data || []) {
    eventsBySeverity[evt.severidade] = (eventsBySeverity[evt.severidade] || 0) + 1;
  }

  return NextResponse.json({
    timestamp: now.toISOString(),
    period: "24h",
    overview: {
      activeCompanies: activeCompanies.count || 0,
      billingPending: billingPending.count || 0,
    },
    email: {
      outbound: emailOutbound24h.count || 0,
      outboundErrors: emailErrors24h.count || 0,
      inbound: emailInbound24h.count || 0,
      errorRate: emailOutbound24h.count
        ? ((emailErrors24h.count || 0) / (emailOutbound24h.count || 1) * 100).toFixed(1) + "%"
        : "0%",
    },
    gesp: {
      tasks: gespTasks24h.count || 0,
      errors: gespErrors24h.count || 0,
      errorRate: gespTasks24h.count
        ? ((gespErrors24h.count || 0) / (gespTasks24h.count || 1) * 100).toFixed(1) + "%"
        : "0%",
    },
    events: {
      total: systemEvents24h.data?.length || 0,
      bySeverity: eventsBySeverity,
      recent: (systemEvents24h.data || []).slice(0, 10),
    },
    queues: queueStats,
  });
}
