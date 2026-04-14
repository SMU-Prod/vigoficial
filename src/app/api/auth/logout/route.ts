import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getAuthFromRequest } from "@/lib/auth/middleware";

/**
 * POST /api/auth/logout
 * Encerra sessão do usuário: limpa cookie JWT e registra no audit log
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);

    // Audit log
    if (auth) {
      const supabase = createSupabaseAdmin();
      await supabase.from("audit_log").insert({
        user_id: auth.userId,
        acao: "logout",
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
        detalhes: { email: auth.email },
      });
    }

    // Limpa cookie via header manual
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    const response = NextResponse.json({ ok: true });
    response.headers.set("Set-Cookie", `vigi_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`);
    return response;
  } catch (err) {
    console.error("[LOGOUT]", err);
    const response = NextResponse.json({ ok: true });
    response.headers.set("Set-Cookie", "vigi_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
    return response;
  }
}
