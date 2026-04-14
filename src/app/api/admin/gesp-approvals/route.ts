import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { adminApproveAction, adminRejectAction, getAdminPendingApprovals, getApprovalHistory } from "@/lib/gesp/admin-gate";

/**
 * GET /api/admin/gesp-approvals?tab=pending|history&companyId=...
 * Lists GESP approval requests for the admin dashboard.
 */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") ?? "pending";
  const companyId = searchParams.get("companyId") ?? undefined;

  try {
    const approvals =
      tab === "history"
        ? await getApprovalHistory(companyId, 100)
        : await getAdminPendingApprovals(companyId);

    // Fetch company details for display
    const supabase = createSupabaseAdmin();
    const companyIds = [...new Set(approvals.map((a) => a.companyId))];

    const { data: companiesData } = await supabase
      .from("companies")
      .select("id, razao_social, cnpj")
      .in("id", companyIds);

    const companies = Object.fromEntries(
      (companiesData ?? []).map((c) => [c.id, c])
    );

    return NextResponse.json({ approvals, companies });
  } catch (err) {
    console.error("[GET /api/admin/gesp-approvals]", err);
    return NextResponse.json(
      { error: "Failed to fetch approvals" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/gesp-approvals
 * Body: { approvalId, decision: "approved"|"rejected", notes?: string }
 * Admin approves or rejects a GESP action request.
 */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  try {
    const body = await request.json();
    const { approvalId, decision, notes } = body;

    if (!approvalId || !decision) {
      return NextResponse.json(
        { error: "approvalId and decision are required" },
        { status: 400 }
      );
    }

    if (!["approved", "rejected"].includes(decision)) {
      return NextResponse.json(
        { error: "decision must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }

    // Get admin user ID from auth context
    const adminUserId = auth?.userId ?? "unknown";

    if (decision === "approved") {
      await adminApproveAction(approvalId, adminUserId, notes);
    } else {
      await adminRejectAction(
        approvalId,
        adminUserId,
        notes ?? "Rejeitado pelo admin sem justificativa"
      );
    }

    return NextResponse.json({ ok: true, decision });
  } catch (err) {
    console.error("[POST /api/admin/gesp-approvals]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process decision" },
      { status: 500 }
    );
  }
}
