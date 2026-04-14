import { createSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Billing Gate — Controla acesso a operações por status de billing
 * PRD Regra R3: Billing gating com exceção legal para CNV e alvará
 */

interface BillingGateResult {
  allowed: boolean;
  status: string;
  reason?: string;
}

/**
 * Verifica se empresa pode executar operações automatizadas
 * Retorna allowed=true apenas se billing_status === 'ativo' ou 'trial'
 *
 * EXCEÇÃO LEGAL: Mesmo se not allowed, alertas para CNV e alvará DEVEM continuar
 */
export async function checkBillingGate(
  companyId: string
): Promise<BillingGateResult> {
  const supabase = createSupabaseAdmin();

  try {
    const { data: company, error } = await supabase
      .from("companies")
      .select("billing_status, razao_social")
      .eq("id", companyId)
      .single();

    if (error || !company) {
      return {
        allowed: false,
        status: "not_found",
        reason: `Empresa ${companyId} não encontrada`,
      };
    }

    const isAllowed = company.billing_status === "ativo" || company.billing_status === "trial";

    if (isAllowed) {
      return {
        allowed: true,
        status: company.billing_status,
      };
    }

    return {
      allowed: false,
      status: company.billing_status,
      reason: `Empresa ${company.razao_social} com billing ${company.billing_status} — operações suspeitas`,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      allowed: false,
      status: "error",
      reason: `Erro ao verificar billing: ${errorMsg}`,
    };
  }
}

/**
 * Verifica se uma operação é uma exceção legal ao billing gating
 * Retorna true para: alerta_cnv, alerta_alvara
 * Essas operações DEVEM ocorrer mesmo com billing suspenso
 */
export function isLegalException(operationType: string): boolean {
  const legalExceptions = ["alerta_cnv", "alerta_alvara"];
  return legalExceptions.includes(operationType);
}

/**
 * Wrapper para autorizar uma operação
 * Retorna true se:
 *   1. Billing está ativo, OU
 *   2. A operação é uma exceção legal
 */
export async function isOperationAllowed(
  companyId: string,
  operationType: string
): Promise<boolean> {
  // Exceções legais são sempre permitidas
  if (isLegalException(operationType)) {
    return true;
  }

  // Caso contrário, verifica billing
  const gate = await checkBillingGate(companyId);
  return gate.allowed;
}
