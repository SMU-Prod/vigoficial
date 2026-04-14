import { NextRequest, NextResponse } from "next/server";
import { verifyToken, type JwtPayload } from "./jwt";
import { apiUnauthorized, apiForbidden } from "@/lib/api/response";
import type { UserRole } from "@/types/database";

/**
 * Extrai e valida o JWT do cookie da request.
 * Usar em API Routes para proteger endpoints.
 */
export function getAuthFromRequest(request: NextRequest): JwtPayload | null {
  const token = request.cookies.get("vigi_token")?.value;
  if (!token) return null;

  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

/**
 * Helper para proteger API Routes com role mínimo.
 * Retorna NextResponse de erro ou null (= autorizado).
 * TD-09: Uses standardized apiUnauthorized/apiForbidden responses
 */
export function requireRole(
  auth: JwtPayload | null,
  minRole: UserRole
): NextResponse | null {
  if (!auth) {
    return apiUnauthorized("Não autenticado");
  }

  const hierarchy: Record<UserRole, number> = {
    admin: 3,
    operador: 2,
    viewer: 1,
  };

  if (hierarchy[auth.role] < hierarchy[minRole]) {
    return apiForbidden("Sem permissão para esta ação");
  }

  return null;
}

/**
 * Verifica se o usuário tem acesso à empresa especificada.
 * Admin tem acesso a todas. Operador/viewer só às autorizadas.
 */
export function canAccessCompany(
  auth: JwtPayload,
  companyId: string
): boolean {
  if (auth.role === "admin") return true;
  return auth.companyIds.includes(companyId);
}
