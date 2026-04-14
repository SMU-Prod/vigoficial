import { NextRequest } from "next/server";
import { consumeExchangeCode } from "@/lib/auth/exchange-store";

/**
 * GET /api/auth/exchange?code=XXX
 *
 * Consumes a one-time exchange code, sets the vigi_token cookie,
 * and renders a tiny HTML page that redirects via meta refresh.
 *
 * Why HTML instead of 302?
 * In Next.js 15+ with Turbopack, the middleware's NextResponse.next()
 * can interfere with Set-Cookie headers on redirect responses from
 * Route Handlers. A 200 HTML response with meta refresh guarantees
 * the browser stores the cookie before navigating.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/login?error=missing_code" },
    });
  }

  const result = await consumeExchangeCode(code);

  if (!result) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/login?error=invalid_code" },
    });
  }

  const { token, redirect } = result;

  // Build cookie header manually
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookieHeader = `vigi_token=${token}; HttpOnly; Path=/; Max-Age=${8 * 60 * 60}; SameSite=Lax${secure}`;

  // HTML page that redirects after browser stores the cookie
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0;url=${redirect}">
  <title>Autenticando...</title>
</head>
<body>
  <p>Redirecionando...</p>
  <script>window.location.replace("${redirect}");</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Set-Cookie": cookieHeader,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
