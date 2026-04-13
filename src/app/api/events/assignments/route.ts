import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole, canAccessCompany } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { z } from "zod";

/**
 * API de vinculação de vigilantes a eventos (Comunicação de Evento)
 *
 * POST   /api/events/assignments — Vincula vigilante(s) a evento
 * DELETE /api/events/assignments — Remove vigilante de evento
 * GET    /api/events/assignments — Lista vigilantes de um evento
 */

const assignSchema = z.object({
  event_id: z.string().uuid("ID do evento inválido"),
  employee_cpfs: z.array(z.string().regex(/^\d{11}$/, "CPF deve ter 11 dígitos")).min(1, "Informe ao menos 1 CPF"),
});

const unassignSchema = z.object({
  event_id: z.string().uuid("ID do evento inválido"),
  employee_cpf: z.string().regex(/^\d{11}$/, "CPF deve ter 11 dígitos"),
});

/**
 * GET /api/events/assignments?event_id=xxx
 * Lista vigilantes vinculados a um evento
 */
export async function GET(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "viewer");
  if (denied) return denied;

  const eventId = new URL(request.url).searchParams.get("event_id");
  if (!eventId) {
    return NextResponse.json({ error: "event_id é obrigatório" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  // Busca evento
  const { data: evento, error: evtError } = await supabase
    .from("comunicacao_eventos")
    .select("id, company_id, nome_evento, vigilantes_cpfs")
    .eq("id", eventId)
    .single();

  if (evtError || !evento) {
    return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });
  }

  if (!canAccessCompany(auth!, evento.company_id)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Busca dados dos vigilantes vinculados
  const cpfs = evento.vigilantes_cpfs || [];
  if (cpfs.length === 0) {
    return NextResponse.json({ event_id: eventId, vigilantes: [] });
  }

  const { data: vigilantes } = await supabase
    .from("employees")
    .select("id, cpf, nome_completo, cnv_numero, cnv_validade, status")
    .eq("company_id", evento.company_id)
    .in("cpf", cpfs);

  return NextResponse.json({
    event_id: eventId,
    nome_evento: evento.nome_evento,
    vigilantes: vigilantes || [],
  });
}

/**
 * POST /api/events/assignments — Vincula vigilantes a evento
 * Body: { event_id, employee_cpfs: ["12345678901", ...] }
 */
export async function POST(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "operador");
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  const { event_id, employee_cpfs } = parsed.data;
  const supabase = createSupabaseAdmin();

  // Busca evento
  const { data: evento, error: evtError } = await supabase
    .from("comunicacao_eventos")
    .select("*")
    .eq("id", event_id)
    .single();

  if (evtError || !evento) {
    return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });
  }

  if (!canAccessCompany(auth!, evento.company_id)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Valida que os CPFs pertencem a vigilantes da empresa
  const { data: employees } = await supabase
    .from("employees")
    .select("cpf, nome_completo")
    .eq("company_id", evento.company_id)
    .in("cpf", employee_cpfs);

  const foundCpfs = new Set((employees || []).map((e) => e.cpf));
  const invalidCpfs = employee_cpfs.filter((cpf) => !foundCpfs.has(cpf));

  if (invalidCpfs.length > 0) {
    return NextResponse.json(
      { error: `CPFs não encontrados nesta empresa: ${invalidCpfs.join(", ")}` },
      { status: 400 }
    );
  }

  // Merge com CPFs existentes (sem duplicatas)
  const currentCpfs = new Set<string>(evento.vigilantes_cpfs || []);
  for (const cpf of employee_cpfs) {
    currentCpfs.add(cpf);
  }

  const updatedCpfs = Array.from(currentCpfs);

  const { error: updateError } = await supabase
    .from("comunicacao_eventos")
    .update({ vigilantes_cpfs: updatedCpfs })
    .eq("id", event_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Audit log
  await supabase.from("audit_log").insert({
    user_id: auth!.userId,
    acao: "vincular_vigilante_evento",
    detalhes: {
      event_id,
      nome_evento: evento.nome_evento,
      cpfs_adicionados: employee_cpfs,
      total_vigilantes: updatedCpfs.length,
    },
    ip: request.headers.get("x-forwarded-for") || "unknown",
  });

  return NextResponse.json({
    event_id,
    vigilantes_cpfs: updatedCpfs,
    adicionados: employee_cpfs.length,
  });
}

/**
 * DELETE /api/events/assignments — Remove vigilante de evento
 * Body: { event_id, employee_cpf }
 */
export async function DELETE(request: NextRequest) {
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "operador");
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const parsed = unassignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 }
    );
  }

  const { event_id, employee_cpf } = parsed.data;
  const supabase = createSupabaseAdmin();

  const { data: evento, error: evtError } = await supabase
    .from("comunicacao_eventos")
    .select("*")
    .eq("id", event_id)
    .single();

  if (evtError || !evento) {
    return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });
  }

  if (!canAccessCompany(auth!, evento.company_id)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const currentCpfs: string[] = evento.vigilantes_cpfs || [];
  const updatedCpfs = currentCpfs.filter((cpf: string) => cpf !== employee_cpf);

  if (updatedCpfs.length === currentCpfs.length) {
    return NextResponse.json(
      { error: "Vigilante não estava vinculado a este evento" },
      { status: 404 }
    );
  }

  const { error: updateError } = await supabase
    .from("comunicacao_eventos")
    .update({ vigilantes_cpfs: updatedCpfs })
    .eq("id", event_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Audit log
  await supabase.from("audit_log").insert({
    user_id: auth!.userId,
    acao: "desvincular_vigilante_evento",
    detalhes: {
      event_id,
      nome_evento: evento.nome_evento,
      cpf_removido: employee_cpf,
      total_vigilantes: updatedCpfs.length,
    },
    ip: request.headers.get("x-forwarded-for") || "unknown",
  });

  return NextResponse.json({
    event_id,
    vigilantes_cpfs: updatedCpfs,
    removido: employee_cpf,
  });
}
