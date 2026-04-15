import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";

/**
 * GET /api/empresas/brain
 *
 * Lista unificada de prospects + companies para a "visão cérebro" da
 * página /empresas/cerebro. Retorna registros normalizados com:
 *   { type, id, cnpj, razao_social, uf, municipio, status, ... }
 *
 * Filtros via query string:
 *   q          → busca por CNPJ, razão social ou nome fantasia
 *   type       → "company" | "prospect" | "all" (default all)
 *   uf         → filtro por UF
 *   limit      → default 200, máx 500
 */
export async function GET(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const type = url.searchParams.get("type") || "all";
  const uf = url.searchParams.get("uf");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "200"), 500);

  try {
    const supabase = createSupabaseAdmin();

    type CompanyRow = {
      id: string;
      cnpj: string;
      razao_social: string;
      nome_fantasia: string | null;
      uf_sede: string | null;
      municipio: string | null;
      plano: string | null;
      billing_status: string | null;
      habilitada: boolean | null;
      created_at: string;
      enriched_at: string | null;
    };
    type ProspectRow = {
      id: string;
      cnpj: string;
      razao_social: string;
      nome_fantasia: string | null;
      uf: string | null;
      municipio: string | null;
      status: string | null;
      temperatura: string | null;
      score: number | null;
      source: string | null;
      created_at: string;
      company_id: string | null;
    };

    const promises: Promise<unknown>[] = [];

    if (type === "all" || type === "company") {
      let cq = supabase
        .from("companies")
        .select(
          "id, cnpj, razao_social, nome_fantasia, uf_sede, municipio, plano, billing_status, habilitada, created_at, enriched_at"
        )
        .order("razao_social")
        .limit(limit);
      if (uf) cq = cq.eq("uf_sede", uf);
      if (q) {
        cq = cq.or(
          `cnpj.ilike.%${q}%,razao_social.ilike.%${q}%,nome_fantasia.ilike.%${q}%`
        );
      }
      promises.push(cq);
    } else {
      promises.push(Promise.resolve({ data: [], error: null }));
    }

    if (type === "all" || type === "prospect") {
      let pq = supabase
        .from("prospects")
        .select(
          "id, cnpj, razao_social, nome_fantasia, uf, municipio, status, temperatura, score, source, created_at, company_id"
        )
        .order("razao_social")
        .limit(limit);
      if (uf) pq = pq.eq("uf", uf);
      if (q) {
        pq = pq.or(
          `cnpj.ilike.%${q}%,razao_social.ilike.%${q}%,nome_fantasia.ilike.%${q}%`
        );
      }
      promises.push(pq);
    } else {
      promises.push(Promise.resolve({ data: [], error: null }));
    }

    const [cRes, pRes] = (await Promise.all(promises)) as [
      { data: CompanyRow[] | null; error: { message: string } | null },
      { data: ProspectRow[] | null; error: { message: string } | null }
    ];

    if (cRes.error) throw new Error(`companies: ${cRes.error.message}`);
    if (pRes.error) throw new Error(`prospects: ${pRes.error.message}`);

    const companies = (cRes.data || []).map((c) => ({
      type: "company" as const,
      id: c.id,
      cnpj: c.cnpj,
      razao_social: c.razao_social,
      nome_fantasia: c.nome_fantasia,
      uf: c.uf_sede,
      municipio: c.municipio,
      status: c.billing_status,
      plano: c.plano,
      habilitada: c.habilitada,
      enriched: !!c.enriched_at,
      created_at: c.created_at,
    }));

    const prospects = (pRes.data || []).map((p) => ({
      type: "prospect" as const,
      id: p.id,
      cnpj: p.cnpj,
      razao_social: p.razao_social,
      nome_fantasia: p.nome_fantasia,
      uf: p.uf,
      municipio: p.municipio,
      status: p.status,
      temperatura: p.temperatura,
      score: p.score,
      source: p.source,
      converted: !!p.company_id,
      created_at: p.created_at,
    }));

    // Sort merged result by razao_social, but companies first when names match
    const merged = [...companies, ...prospects].sort((a, b) =>
      (a.razao_social || "").localeCompare(b.razao_social || "")
    );

    return NextResponse.json({
      total: merged.length,
      companies_count: companies.length,
      prospects_count: prospects.length,
      items: merged,
    });
  } catch (err) {
    console.error("[BRAIN/LIST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro" },
      { status: 500 }
    );
  }
}
