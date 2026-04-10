import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole, canAccessCompany } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { validateBody } from "@/lib/validation/schemas";
import { z } from "zod";

const createThreadSchema = z.object({
  company_id: z.string().uuid(),
  subject: z.string().min(1).max(255),
  cnpj_detectado: z.string().optional(),
});

/**
 * GET /api/threads — Lista threads (filtrada por role)
 */
export async function GET(request: NextRequest) {
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const companyId = searchParams.get("company_id");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "0");
  const limit = parseInt(searchParams.get("limit") || "20");

  const supabase = createSupabaseAdmin();

  let query = supabase
    .from("threads")
    .select(
      `*,
       companies(razao_social),
       thread_participants(id)`,
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  // Filtro por empresa
  if (companyId) {
    if (!canAccessCompany(auth!, companyId)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
    query = query.eq("company_id", companyId);
  } else if (auth!.role !== "admin") {
    // Operador/viewer: apenas empresas autorizadas
    query = query.in("company_id", auth!.companyIds);
  }

  if (status) {
    query = query.eq("status", status);
  }

  if (search) {
    query = query.or(`subject.ilike.%${search}%,cnpj_detectado.ilike.%${search}%`);
  }

  // Pagination
  query = query.range(page * limit, (page + 1) * limit - 1);

  const { data, error, count } = await query;

  if (error) {
    // Table might not exist yet in dev — return empty result instead of 500
    console.error("[THREADS GET]", error.message);
    return NextResponse.json({ threads: [], count: 0, page, limit });
  }

  // Transform response to include participant count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const threads = (data || []).map((thread: any) => ({
    ...thread,
    participant_count: thread.thread_participants?.length || 0,
    thread_participants: undefined,
  }));

  return NextResponse.json({
    threads,
    count,
    page,
    limit,
  });
}

/**
 * POST /api/threads — Cria novo thread manualmente
 */
export async function POST(request: NextRequest) {
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "operador");
  if (denied) return denied;

  try {
    // Validate body
    const { data: parsed, error: validationError } = await validateBody(request, createThreadSchema);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!canAccessCompany(auth!, (parsed as any).company_id)) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const supabase = createSupabaseAdmin();

    const threadData = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company_id: (parsed as any).company_id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      subject: (parsed as any).subject,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cnpj_detectado: (parsed as any).cnpj_detectado,
      status: "ABERTO",
      created_by: auth!.userId,
    };

    const { data: insertedThread, error: dbError } = await supabase
      .from("threads")
      .insert(threadData)
      .select()
      .single();

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    // Add creator as participant
    await supabase.from("thread_participants").insert({
      thread_id: insertedThread.id,
      user_id: auth!.userId,
      ativo: true,
    });

    // Audit log
    await supabase.from("audit_log").insert({
      user_id: auth!.userId,
      acao: "criar_thread",
      detalhes: {
        thread_id: insertedThread.id,
        company_id: insertedThread.company_id,
        subject: insertedThread.subject,
      },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    return NextResponse.json(insertedThread, { status: 201 });
  } catch (err) {
    console.error("[THREADS POST]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
