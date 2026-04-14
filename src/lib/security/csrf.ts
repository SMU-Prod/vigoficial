import { NextRequest, NextResponse } from "next/server";
import { randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const CSRF_TOKEN_COOKIE = "vigi_csrf_token";
const CSRF_TOKEN_HEADER = "x-csrf-token";
const CSRF_TOKEN_LENGTH = 32; // 256 bits

/**
 * Generate a CSRF token and optionally set it in cookies
 */
export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
}

/**
 * Set CSRF token in response cookie
 */
export async function setCsrfTokenCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CSRF_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60, // 24 hours
  });
}

/**
 * Validate CSRF token from request header against cookie
 */
export async function validateCsrfToken(request: NextRequest): Promise<boolean> {
  const tokenFromHeader = request.headers.get(CSRF_TOKEN_HEADER);
  if (!tokenFromHeader) {
    return false;
  }

  const cookieStore = await cookies();
  const tokenFromCookie = cookieStore.get(CSRF_TOKEN_COOKIE)?.value;

  if (!tokenFromCookie) {
    return false;
  }

  // FIX: SEG-01 - Use crypto.timingSafeEqual() for constant-time comparison to prevent timing attacks
  try {
    return timingSafeEqual(
      Buffer.from(tokenFromHeader),
      Buffer.from(tokenFromCookie)
    );
  } catch {
    // If comparison fails (e.g., different lengths), return false
    return false;
  }
}

/**
 * CSRF validation middleware response
 */
export function createCsrfErrorResponse(): NextResponse {
  return NextResponse.json(
    { error: "Invalid CSRF token" },
    { status: 403 }
  );
}

/**
 * Check if request method requires CSRF validation
 */
export function requiresCsrfValidation(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase());
}
