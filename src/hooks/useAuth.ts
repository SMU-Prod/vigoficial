"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export interface AuthUser {
  userId: string;
  email: string;
  role: "admin" | "operador" | "viewer";
  companyIds: string[];
}

interface UseAuthReturn {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  isOperador: boolean;
  hasRole: (minRole: "admin" | "operador" | "viewer") => boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const ROLE_HIERARCHY: Record<string, number> = {
  admin: 3,
  operador: 2,
  viewer: 1,
};

/**
 * Hook de autenticação para componentes client-side.
 * Busca /api/auth/me para obter dados do JWT (httpOnly cookie).
 * Redireciona para /login se não autenticado.
 */
export function useAuth(options?: { redirectOnFail?: boolean }): UseAuthReturn {
  const { redirectOnFail = true } = options || {};
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/auth/me", { credentials: "same-origin" });

      if (!res.ok) {
        setUser(null);
        if (redirectOnFail && (res.status === 401 || res.status === 403)) {
          router.push("/login");
        }
        return;
      }

      const data = await res.json();
      setUser(data);
    } catch {
      setError("Erro ao verificar autenticação");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [redirectOnFail, router]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      router.push("/login");
    }
  }, [router]);

  const hasRole = useCallback(
    (minRole: "admin" | "operador" | "viewer"): boolean => {
      if (!user) return false;
      return (ROLE_HIERARCHY[user.role] || 0) >= (ROLE_HIERARCHY[minRole] || 0);
    },
    [user]
  );

  return {
    user,
    loading,
    error,
    isAdmin: user?.role === "admin",
    isOperador: user?.role === "operador" || user?.role === "admin",
    hasRole,
    logout,
    refresh: fetchUser,
  };
}
