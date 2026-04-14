import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { verifyCronAuth } from "@/lib/security/cron-auth";

const publicRoutes = ["/login", "/api/webhooks", "/api/auth/login", "/api/auth/mfa"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Auth callback: seta cookie direto no middleware ──
  // O middleware roda no Edge Runtime onde 'jsonwebtoken' NÃO funciona
  // (usa Node.js crypto que não existe no Edge).
  // O token acabou de ser gerado pelo login route (Node.js runtime).
  // A verificação real acontece no updateSession() em cada request subsequente.
  if (pathname === "/auth/callback") {
    const token = request.nextUrl.searchParams.get("token");
    const redirect = request.nextUrl.searchParams.get("redirect") || "/dashboard";

    if (!token) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    // Seta o cookie e redireciona — sem verifyToken() aqui (Edge Runtime)
    const response = NextResponse.redirect(new URL(redirect, request.url));

    response.cookies.set("vigi_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60,
    });

    return response;
  }

  // Rotas públicas — não precisam de auth
  if (publicRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // API de cron — FIX: SEG-07 - autenticada via HMAC-SHA256 com timestamp validation
  if (pathname.startsWith("/api/cron")) {
    const cronResult = await verifyCronAuth(
      request.headers.get("authorization"),
      process.env.CRON_SECRET
    );

    if (!cronResult.valid) {
      console.error(`[CRON] Unauthorized access attempt to ${pathname}: ${cronResult.error}`);
      return NextResponse.json({ error: cronResult.error || "Unauthorized" }, { status: 401 });
    }

    // IP whitelist (optional secondary check)
    const allowedIps = process.env.CRON_ALLOWED_IPS?.split(",").map(ip => ip.trim());
    if (allowedIps && allowedIps.length > 0) {
      const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
      if (!allowedIps.includes(clientIp)) {
        console.error(`[CRON] Blocked request from IP ${clientIp} (not in whitelist)`);
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    return NextResponse.next();
  }

  // Validação de sessão
  const response = await updateSession(request);

  // FIX: SEG-09 - Add Content-Security-Policy header
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' https:; " +
    "frame-ancestors 'self'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  );

  // Additional security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
