import { createSupabaseAdmin } from "@/lib/supabase/server";

/**
 * GESP Lock Manager — Enforça Regra R5
 * PRD Seção 3.2, Regra R5: Máx. 1 sessão por empresa, 3 browsers no servidor
 */

interface GespLockResult {
  acquired: boolean;
  sessionId?: string;
  reason?: string;
}

/**
 * Limpa sessões GESP que ficaram presas (stale)
 * Sessões com status='ativo' criadas há mais de 4 horas são marcadas como finalizadas
 * @returns Número de sessões limpas
 */
export async function cleanupStaleLocks(): Promise<number> {
  const supabase = createSupabaseAdmin();

  try {
    // Calcula timestamp de 4 horas atrás
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    // Busca sessões ativas criadas há mais de 4 horas
    const { data: staleSessions, error: err1 } = await supabase
      .from("gesp_sessions")
      .select("id")
      .eq("status", "ativo")
      .lt("created_at", fourHoursAgo);

    if (err1) {
      console.error("[GESP-LOCK] Erro ao buscar sessões stale:", err1.message);
      return 0;
    }

    if (!staleSessions || staleSessions.length === 0) {
      return 0;
    }

    // Marca sessões stale como finalizadas
    const { error: err2 } = await supabase
      .from("gesp_sessions")
      .update({
        status: "finalizado",
        erro_detalhe: "Cleanup automático — sessão expirada após 4h",
        finished_at: new Date().toISOString(),
      })
      .eq("status", "ativo")
      .lt("created_at", fourHoursAgo);

    if (err2) {
      console.error("[GESP-LOCK] Erro ao limpar sessões stale:", err2.message);
      return 0;
    }

    console.log(`[GESP-LOCK] ${staleSessions.length} sessões stale limpas`);
    return staleSessions.length;
  } catch (err) {
    console.error(
      "[GESP-LOCK] Exceção ao limpar locks stale:",
      err instanceof Error ? err.message : String(err)
    );
    return 0;
  }
}

/**
 * Tenta adquirir lock GESP para uma empresa
 * Verifica:
 *   1. Se há sessão ativa para a empresa (máx 1)
 *   2. Se total de sessões ativas < 3 (limite global)
 * Se ambas passam, cria nova gesp_session e retorna true
 */
export async function acquireGespLock(companyId: string): Promise<GespLockResult> {
  const supabase = createSupabaseAdmin();

  try {
    // 0. Limpa sessões stale antes de verificar locks ativos
    await cleanupStaleLocks();

    // 1. Verifica se há sessão ativa para esta empresa
    const { data: activeSessions, error: err1 } = await supabase
      .from("gesp_sessions")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "ativo");

    if (err1) {
      return {
        acquired: false,
        reason: `Erro ao verificar sessões: ${err1.message}`,
      };
    }

    if (activeSessions && activeSessions.length > 0) {
      return {
        acquired: false,
        reason: `Já existe sessão GESP ativa para empresa ${companyId}`,
      };
    }

    // 2. Verifica limite global (máx 3 browsers)
    const { count, error: err2 } = await supabase
      .from("gesp_sessions")
      .select("id", { count: "exact", head: true })
      .eq("status", "ativo");

    if (err2) {
      return {
        acquired: false,
        reason: `Erro ao contar sessões: ${err2.message}`,
      };
    }

    if ((count || 0) >= 3) {
      return {
        acquired: false,
        reason: `Limite de 3 browsers simultâneos atingido (Regra R5)`,
      };
    }

    // 3. Cria nova sessão (lock acquired)
    const { data: session, error: err3 } = await supabase
      .from("gesp_sessions")
      .insert({
        company_id: companyId,
        browser_pid: process.pid,
        status: "ativo",
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (err3 || !session) {
      return {
        acquired: false,
        reason: `Erro ao criar sessão: ${err3?.message || "desconhecido"}`,
      };
    }

    return {
      acquired: true,
      sessionId: session.id,
    };
  } catch (err) {
    return {
      acquired: false,
      reason: `Exceção ao adquirir lock: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Libera lock GESP — marca sessão como finalizada
 */
export async function releaseGespLock(sessionId: string): Promise<void> {
  const supabase = createSupabaseAdmin();

  try {
    await supabase
      .from("gesp_sessions")
      .update({
        status: "finalizado",
        finished_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
  } catch (err) {
    console.error(
      `[GESP-LOCK] Erro ao liberar lock ${sessionId}:`,
      err instanceof Error ? err.message : String(err)
    );
    // Não falha — apenas loga erro
  }
}

/**
 * Verifica se há sessão ativa para a empresa
 */
export async function isCompanyLocked(companyId: string): Promise<boolean> {
  const supabase = createSupabaseAdmin();

  try {
    const { data: sessions } = await supabase
      .from("gesp_sessions")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "ativo")
      .limit(1);

    return (sessions && sessions.length > 0) ? true : false;
  } catch (err) {
    console.error("[GESP-LOCK] Erro ao verificar lock:", err);
    return false;
  }
}

/**
 * Conta sessões ativas no servidor
 * Deve ser <= 3 por Regra R5
 */
export async function getActiveBrowserCount(): Promise<number> {
  const supabase = createSupabaseAdmin();

  try {
    const { count, error } = await supabase
      .from("gesp_sessions")
      .select("id", { count: "exact", head: true })
      .eq("status", "ativo");

    if (error) {
      console.error("[GESP-LOCK] Erro ao contar browsers:", error);
      return 0;
    }

    return count || 0;
  } catch (err) {
    console.error("[GESP-LOCK] Exceção ao contar browsers:", err);
    return 0;
  }
}
