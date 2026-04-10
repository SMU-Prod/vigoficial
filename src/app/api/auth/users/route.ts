import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { rateLimit, rateLimitConfig, createRateLimitResponse } from "@/lib/security/rate-limit";
import { validateBody, createUserSchema } from "@/lib/validation/schemas";
import { notifySystem } from "@/lib/services/notification-service";
/**
 * GET /api/auth/users — Lista usuários (admin only)
 */
export async function GET(request: NextRequest) {
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  const supabase = createSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, nome, role, company_ids, deve_trocar_senha, mfa_enabled, created_at")
    .order("nome");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * POST /api/auth/users — Cria novo usuário (admin only)
 */
export async function POST(request: NextRequest) {
  // Rate limiting
  const limitResult = await rateLimit(request, rateLimitConfig.api);
  const limitResponse = createRateLimitResponse(limitResult);
  if (limitResponse) return limitResponse;

  const auth = getAuthFromRequest(request);
  const denied = requireRole(auth, "admin");
  if (denied) return denied;

  try {
    // Validate body
    const { data: parsed, error: validationError } = await validateBody(request, createUserSchema);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const strength = validatePasswordStrength((parsed as any).password);
    if (!strength.valid) {
      return NextResponse.json(
        { error: "Senha fraca", details: strength.errors },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();

    const parsedData = parsed as { email: string; password: string; nome: string; role: string; company_ids: string[] };

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("email", parsedData.email.toLowerCase())
      .single();

    if (existing) {
      return NextResponse.json({ error: "Email já cadastrado" }, { status: 409 });
    }

    const password_hash = await hashPassword(parsedData.password);

    const { data, error } = await supabase
      .from("users")
      .insert({
        email: parsedData.email.toLowerCase(),
        password_hash,
        nome: parsedData.nome,
        role: parsedData.role,
        company_ids: parsedData.company_ids,
        deve_trocar_senha: false,
      })
      .select("id, email, nome, role, company_ids, created_at")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase.from("audit_log").insert({
      user_id: auth!.userId,
      acao: "criar_usuario",
      detalhes: { new_user_id: data.id, email: data.email, role: data.role },
      ip: request.headers.get("x-forwarded-for") || "unknown",
    });

    notifySystem("Novo usuário criado", data.email || "Usuário", "info").catch(() => {});

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[USERS POST]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
