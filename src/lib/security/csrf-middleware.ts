/**
 * FE-02: CSRF Middleware
 * Implements double-submit cookie pattern with constant-time comparison
 * Prevents Cross-Site Request Forgery attacks on mutation APIs
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const CSRF_COOKIE_NAME = "vigi_csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_TOKEN_LENGTH = 32; // 256 bits

/**
 * Generate a new CSRF token
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
}

/**
 * Set CSRF token in response cookie
 */
export function setCsrfTokenCookie(response: NextResponse, token: string): void {
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Must be accessible to JavaScript for header submission
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
}

/**
 * Verify CSRF token using constant-time comparison
 * FE-02: Uses timingSafeEqual to prevent timing attacks
 */
export function verifyCsrfToken(request: NextRequest): {
  valid: boolean;
  error?: string;
  token?: string;
} {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);

  if (!cookieToken) {
    return {
      valid: false,
      error: "CSRF token missing in cookie",
    };
  }

  if (!headerToken) {
    return {
      valid: false,
      error: "CSRF token missing in request header",
    };
  }

  // Use constant-time comparison to prevent timing attacks
  try {
    const cookieBuffer = Buffer.from(cookieToken, "hex");
    const headerBuffer = Buffer.from(headerToken, "hex");

    // Ensure buffers are same length before comparison
    if (cookieBuffer.length !== headerBuffer.length) {
      return {
        valid: false,
        error: "CSRF token format mismatch",
      };
    }

    const isValid = crypto.timingSafeEqual(cookieBuffer, headerBuffer);
    return {
      valid: isValid,
      token: headerToken,
    };
  } catch (_err) {
    return {
      valid: false,
      error: "CSRF token comparison failed",
    };
  }
}

/**
 * CSRF validation middleware for POST/PUT/DELETE/PATCH requests
 * Usage: Add to mutation API routes before processing request
 *
 * Example:
 * export async function POST(request: NextRequest) {
 *   const csrfCheck = validateCsrf(request);
 *   if (!csrfCheck.valid) {
 *     return NextResponse.json({ error: csrfCheck.error }, { status: 403 });
 *   }
 *   // ... rest of handler
 * }
 */
export function validateCsrf(request: NextRequest): {
  valid: boolean;
  error?: string;
} {
  const method = request.method.toUpperCase();

  // Only enforce CSRF on mutation methods
  const mutationMethods = ["POST", "PUT", "PATCH", "DELETE"];
  if (!mutationMethods.includes(method)) {
    return { valid: true }; // Skip CSRF check for GET/HEAD/OPTIONS
  }

  // Skip CSRF check for certain safe endpoints
  const pathname = new URL(request.url).pathname;
  const exemptPaths = [
    "/api/auth/login",
    "/api/auth/register",
    "/api/webhooks", // Webhooks have their own verification
  ];

  if (exemptPaths.some((path) => pathname.startsWith(path))) {
    return { valid: true };
  }

  return verifyCsrfToken(request);
}

/**
 * Create a response with CSRF token set if not already present
 */
export function ensureCsrfToken(request: NextRequest, response: NextResponse): NextResponse {
  const existingToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;

  if (!existingToken) {
    const newToken = generateCsrfToken();
    setCsrfTokenCookie(response, newToken);
  }

  return response;
}
