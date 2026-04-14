import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import {
  batchEnrichProspects,
  batchEnrichCompanies,
  batchEnrichAll,
  enrichCompany,
} from "@/lib/services/cnpj-enrichment";

/**
 * POST /api/admin/enrich
 *
 * Dispara enriquecimento em batch via BrasilAPI.
 *
 * Body:
 *   { target: "prospects" }      → enriquece prospects sem dados
 *   { target: "companies" }      → enriquece companies sem dados
 *   { target: "all" }            → enriquece ambos
 *   { target: "company", id: "uuid" } → enriquece uma company específica
 *   { limit?: number }           → máximo de registros (default: 200 prospects / 100 companies)
 */
export async function POST(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  const roleError = requireRole(auth, "admin");
  if (roleError) return roleError;

  let body: { target: string; id?: string; limit?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const { target, id, limit } = body;

  if (!target) {
    return NextResponse.json(
      { error: "target é obrigatório: 'prospects', 'companies', 'all', ou 'company'" },
      { status: 400 }
    );
  }

  try {
    switch (target) {
      case "prospects": {
        const result = await batchEnrichProspects(limit || 200);
        return NextResponse.json({ ok: true, result });
      }
      case "companies": {
        const result = await batchEnrichCompanies(limit || 100);
        return NextResponse.json({ ok: true, result });
      }
      case "all": {
        const result = await batchEnrichAll();
        return NextResponse.json({ ok: true, result });
      }
      case "company": {
        if (!id) {
          return NextResponse.json({ error: "id é obrigatório para target 'company'" }, { status: 400 });
        }
        const result = await enrichCompany(id);
        return NextResponse.json({ ok: true, result });
      }
      default:
        return NextResponse.json(
          { error: `target inválido: '${target}'. Use 'prospects', 'companies', 'all', ou 'company'` },
          { status: 400 }
        );
    }
  } catch (err) {
    console.error("[ADMIN/ENRICH] Erro:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/enrich
 *
 * Retorna estatísticas de enriquecimento:
 * - Quantos prospects faltam enriquecer
 * - Quantas companies faltam enriquecer
 */
export async function GET(request: NextRequest) {
  const auth = getAuthFromRequest(request);
  const roleError = requireRole(auth, "admin");
  if (roleError) return roleError;

  const { createSupabaseAdmin } = await import("@/lib/supabase/server");
  const supabase = createSupabaseAdmin();

  const [prospectsTotal, prospectsNotEnriched, companiesTotal, companiesNotEnriched] =
    await Promise.all([
      supabase.from("prospects").select("*", { count: "exact", head: true }),
      supabase.from("prospects").select("*", { count: "exact", head: true }).is("cnae_principal", null).not("cnpj", "is", null),
      supabase.from("companies").select("*", { count: "exact", head: true }),
      supabase.from("companies").select("*", { count: "exact", head: true }).is("enriched_at", null),
    ]);

  return NextResponse.json({
    prospects: {
      total: prospectsTotal.count || 0,
      pendingEnrichment: prospectsNotEnriched.count || 0,
      enriched: (prospectsTotal.count || 0) - (prospectsNotEnriched.count || 0),
    },
    companies: {
      total: companiesTotal.count || 0,
      pendingEnrichment: companiesNotEnriched.count || 0,
      enriched: (companiesTotal.count || 0) - (companiesNotEnriched.count || 0),
    },
  });
}
