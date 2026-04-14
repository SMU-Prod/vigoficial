import jwt from "jsonwebtoken";
import type { UserRole } from "@/types/database";
import { env } from "@/lib/config/env"; // OPS-02: Use validated env

const JWT_SECRET = env.JWT_SECRET;
// FIX: SEG-08 - Reduced token expiration from 8h to 30min to limit token exposure window
const JWT_EXPIRES_IN = "30m";
const MFA_TEMP_TOKEN_EXPIRES = "5m"; // Temp token válido por 5 minutos

/**
 * KNOWN ISSUE: SEG-05 - JWT in URL
 * The exchange flow passes JWT codes through URL parameters, which can leak tokens
 * in browser history, referer headers, and server logs. Current implementation mitigates
 * this by using one-time exchange codes that expire quickly. Frontend and backend
 * must work together to use POST body instead of URL parameters (requires frontend changes).
 * Tracked as medium-priority architectural change requiring coordination with frontend team.
 */

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  companyIds: string[];
}

export interface MfaTempPayload {
  userId: string;
  mfaPending: true;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

/**
 * Generate temporary token for MFA verification (5 min expiration)
 */
export function signMfaTempToken(userId: string): string {
  const payload: MfaTempPayload = {
    userId,
    mfaPending: true,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: MFA_TEMP_TOKEN_EXPIRES });
}

/**
 * Verify and extract userId from MFA temp token
 */
export function verifyMfaTempToken(token: string): string {
  const payload = jwt.verify(token, JWT_SECRET) as MfaTempPayload;
  if (!payload.mfaPending) {
    throw new Error("Invalid MFA temp token");
  }
  return payload.userId;
}
