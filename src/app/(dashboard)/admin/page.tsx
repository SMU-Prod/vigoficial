"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /admin redireciona para /admin/usuarios
 * Funcionalidades admin estão em páginas dedicadas:
 * - /admin/usuarios (gestão de colaboradores)
 * - /admin/audit (log imutável)
 * - /admin/filas (BullMQ)
 * - /admin/agentes (IA + Knowledge Base)
 * DELESPs acessíveis via API /api/admin/delesp (usado internamente pelos ofícios)
 */
export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/usuarios");
  }, [router]);

  return null;
}
