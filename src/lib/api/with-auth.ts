/**
 * TD-07: Unified Authentication & Authorization Wrapper
 * Eliminates duplicated boilerplate across API routes
 * Combines rate limiting, CSRF validation, auth checks, and error handling
 *
 * Usage:
 * ```typescript
 * // GET endpoint (read-only, no CSRF needed)
 * export const GET = withAuth(async (request, { auth }) => {
 *   return apiSuccess({ userId: auth.userId });
 * }, { role: "viewer" });
 *
 * // POST endpoint (mutation, requires CSRF)
 * export const POST = withAuth(async (request, { auth, params }) => {
 *   const { id } = params!;
 *   return apiSuccess({ created: true });
 * }, { role: "operador", csrf: true });
 *
 * // Admin-only with custom rate limit
 * export const DELETE = withAuth(async (request, { auth }) => {
 *   return apiSuccess({ deleted: true });
 * }, {
 *   role: "admin",
 *   csrf: true,
 *   rateLimit: { windowMs: 60 * 1000, maxRequests: 10 }
 * });
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, requireRole } from "@/lib/auth/middleware";
import { rateLimit, rateLimitConfig, createRateLimitResponse, type RateLimitConfig } from "@/lib/security/rate-limit";
import { validateCsrf } from "@/lib/security/csrf-middleware";
import { apiUnauthorized, apiServerError, apiError } from "@/lib/api/response";
import type { JwtPayload } from "@/lib/auth/jwt";
import type { UserRole } from "@/types/database";

/**
 * Configuration options for withAuth wrapper
 */
interface WithAuthOptions {
  /**
   * Minimum role required to access this endpoint.
   * Hierarchy: admin (3) > operador (2) > viewer (1)
   * @default "viewer"
   */
  role?: UserRole;

  /**
   * Rate limit configuration.
   * Prevents abuse by limiting requests per IP address.
   * @default rateLimitConfig.api (100 requests per minute)
   */
  rateLimit?: RateLimitConfig;

  /**
   * Whether to validate CSRF token for this request.
   * Set to true for POST, PUT, PATCH, DELETE (mutation methods).
   * GET, HEAD, OPTIONS are safe from CSRF and should use false.
   * @default false
   */
  csrf?: boolean;
}

/**
 * Handler function signature for authenticated API routes
 * @param request - The NextRequest from the handler
 * @param context - Contains auth payload and optional route params
 * @returns Promise<NextResponse> with the response
 */
type AuthenticatedHandler = (
  request: NextRequest,
  context: { auth: JwtPayload; params?: Record<string, string> }
) => Promise<NextResponse>;

/**
 * Higher-order function that wraps API route handlers with authentication & authorization
 *
 * Applies middleware in this order:
 * 1. Rate limiting (check IP-based request limit)
 * 2. CSRF validation (for mutations)
 * 3. JWT authentication (extract & verify token from cookie)
 * 4. Role-based authorization (check minimum role requirement)
 * 5. Execute handler with auth context
 * 6. Global error handling (catch unhandled exceptions)
 *
 * @param handler - The API route handler to wrap
 * @param options - Configuration options (role, rateLimit, csrf)
 * @returns Wrapped handler function compatible with Next.js API routes
 *
 * @example
 * // Protected read endpoint
 * export const GET = withAuth(
 *   async (request, { auth }) => apiSuccess(auth),
 *   { role: "viewer" }
 * );
 *
 * @example
 * // Protected mutation with CSRF
 * export const POST = withAuth(
 *   async (request, { auth, params }) => {
 *     const data = await request.json();
 *     // Process data
 *     return apiSuccess({ success: true });
 *   },
 *   { role: "operador", csrf: true }
 * );
 */
export function withAuth(
  handler: AuthenticatedHandler,
  options: WithAuthOptions = {}
) {
  return async (
    request: NextRequest,
    routeContext?: { params?: Promise<Record<string, string>> }
  ) => {
    try {
      // ─── Step 1: Rate Limiting ──────────────────────────────────────────
      const rlConfig = options.rateLimit ?? rateLimitConfig.api;
      const limitResult = await rateLimit(request, rlConfig);
      const limitResponse = createRateLimitResponse(limitResult);
      if (limitResponse) return limitResponse;

      // ─── Step 2: CSRF Validation (for mutations) ───────────────────────
      if (options.csrf) {
        const csrfCheck = validateCsrf(request);
        if (!csrfCheck.valid) {
          return apiError("CSRF_INVALID", "CSRF token validation failed", 403);
        }
      }

      // ─── Step 3: Authentication ───────────────────────────────────────
      const auth = getAuthFromRequest(request);
      if (!auth) {
        return apiUnauthorized("Não autenticado");
      }

      // ─── Step 4: Authorization ────────────────────────────────────────
      const minRole = options.role ?? "viewer";
      const authorizationError = requireRole(auth, minRole);
      if (authorizationError) return authorizationError;

      // ─── Step 5: Resolve async params (Next.js 15 style) ──────────────
      const params = routeContext?.params ? await routeContext.params : undefined;

      // ─── Step 6: Execute handler ──────────────────────────────────────
      return await handler(request, { auth, params });
    } catch (err) {
      // ─── Global Error Handler ────────────────────────────────────────
      const method = request.method;
      const pathname = new URL(request.url).pathname;
      console.error(`[API ${method} ${pathname}] Unhandled error:`, err);

      // Return standardized 500 error
      return apiServerError("Erro interno do servidor");
    }
  };
}
