import { NextResponse, type NextRequest } from "next/server";
import { verifyTokenEdge } from "@/lib/auth/jwt-edge";

/**
 * Middleware de autenticação do VIG PRO.
 *
 * O sistema usa JWT customizado (cookie "vigi_token"), NÃO Supabase Auth.
 * - Login: /api/auth/login → bcrypt + signToken() → cookie httpOnly
 * - Validação: verifyTokenEdge() com HMAC-SHA256 (Web Crypto API)
 * - Supabase é usado apenas como banco de dados (via service_role key)
 *
 * IMPORTANTE: Este código roda no Edge Runtime do middleware.
 * Usa jwt-edge.ts (Web Crypto API) em vez de jwt.ts (jsonwebtoken/Node.js).
 *
 * Se o JWT é inválido/expirado, redireciona para /login.
 */
export async function updateSession(request: NextRequest) {
  const token = request.cookies.get("vigi_token")?.value;

  // Sem token → redireciona para login
  if (!token) {
    // Para API routes, retorna 401
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Não autenticado" },
        { status: 401 }
      );
    }
    // Para páginas, redireciona
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Verifica validade do JWT (Web Crypto API — Edge compatible)
  try {
    await verifyTokenEdge(token);
    // Token válido — segue normalmente
    return NextResponse.next();
  } catch {
    // Token expirado/inválido → limpa cookie e redireciona
    if (request.nextUrl.pathname.startsWith("/api/")) {
      const response = NextResponse.json(
        { error: "Sessão expirada" },
        { status: 401 }
      );
      response.cookies.set("vigi_token", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      return response;
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.set("vigi_token", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  }
}
