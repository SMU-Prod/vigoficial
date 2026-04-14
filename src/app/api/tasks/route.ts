import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";

/**
 * GET /api/tasks — Lista tarefas GESP (gesp_tasks) com dados da empresa
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);
    const denied = requireRole(auth, "viewer");
    if (denied) return denied;

    const supabase = createSupabaseAdmin();

    let query = supabase
      .from("gesp_tasks")
      .select(
        `id, status, tipo, company_id, prioridade, created_at, prazo, detalhes,
         companies(razao_social, cnpj)`,
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .limit(200);

    // Non-admin users: filter by their assigned companies
    if (auth!.role !== "admin") {
      query = query.in("company_id", auth!.companyIds);
    }

    const { data, error, count: _count } = await query;

    if (error) {
      // Table might not exist yet in dev — return empty
      console.error("[TASKS GET]", error.message);
      return NextResponse.json([], { status: 200 });
    }

    // Transform to match the Task interface expected by the page
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tasks = (data || []).map((t: any) => ({
      id: t.id,
      status: t.status || "pendente",
      tipo: t.tipo || "gesp",
      company_id: t.company_id,
      company_name: t.companies?.razao_social || "—",
      cnpj: t.companies?.cnpj || "—",
      prioridade: t.prioridade || "normal",
      created_at: t.created_at,
      prazo: t.prazo,
    }));

    return NextResponse.json(tasks);
  } catch (err) {
    console.error("[TASKS GET] Unexpected:", err);
    return NextResponse.json([], { status: 200 });
  }
}
