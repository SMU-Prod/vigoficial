import { createSupabaseAdmin } from "@/lib/supabase/server";
import { addEmailSendJob } from "@/lib/queue/jobs";
import { checkBillingGate } from "@/lib/security/billing-gate";
import { diasRestantes } from "@/lib/utils";
import { notifyComplianceExpiring } from "@/lib/services/notification-service";

/**
 * Motor de Compliance — verifica todas as validades de uma empresa
 * PRD Seção 3.7 — Motor de Validades e Compliance
 * Regra R3: Billing gating (exceção legal para CNV e alvará)
 * Regra R9: Parar alertas quando validade renovada (alertas_ativos JSONB)
 */

// ──── Types ────

export interface ValidityCheck {
  tipo: "cnv" | "reciclagem" | "alvara" | "porte_arma" | "colete" | "ecpf" | "licenciamento" | "seguro" | "vistoria_pf";
  entidade_id: string;
  entidade_tipo: "employee" | "company" | "vehicle";
  company_id: string;
  data_validade: string;
  dias_restantes: number;
  alertas_ativos: boolean;
}

export interface ComplianceResult {
  checks_realizados: number;
  alertas_enviados: number;
  alertas_parados: number; // R9 — stopped because renewed
  erros: string[];
}

interface AlertaPendente {
  tipo: string;
  entidade: string;
  campo: string;
  dias: number;
  template: "C" | "F";
  dataValidade: string;
  severidade: string;
}

// ──── Main Compliance Check ────

/**
 * Executa ciclo completo de compliance para empresa
 * Called by compliance worker in src/workers/index.ts
 */
export async function runComplianceCheck(companyId: string): Promise<ComplianceResult> {
  const supabase = createSupabaseAdmin();
  const result: ComplianceResult = {
    checks_realizados: 0,
    alertas_enviados: 0,
    alertas_parados: 0,
    erros: [],
  };

  try {
    // Busca dados da empresa
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      result.erros.push(`Empresa ${companyId} não encontrada`);
      return result;
    }

    // ──── STEP 1: Check billing status (R3) ────
    const billingGate = await checkBillingGate(companyId);
    const billingAtivo = billingGate.allowed;

    // ──── STEP 2-3: Gather and calculate validity checks ────
    const validityChecks: (ValidityCheck | null)[] = [];

    // Company-level validities
    // Alvará (ALWAYS checked — legal exception per R3)
    if (company.alvara_validade) {
      const dias = diasRestantes(company.alvara_validade);
      if (dias !== null) {
        validityChecks.push({
          tipo: "alvara",
          entidade_id: company.id,
          entidade_tipo: "company",
          company_id: companyId,
          data_validade: company.alvara_validade,
          dias_restantes: dias,
          alertas_ativos: company.alertas_ativos?.alvara !== false,
        });
        result.checks_realizados++;
      }
    }

    // e-CPF A1 (only if billing active)
    if (billingAtivo && company.ecpf_validade) {
      const dias = diasRestantes(company.ecpf_validade);
      if (dias !== null) {
        validityChecks.push({
          tipo: "ecpf",
          entidade_id: company.id,
          entidade_tipo: "company",
          company_id: companyId,
          data_validade: company.ecpf_validade,
          dias_restantes: dias,
          alertas_ativos: company.alertas_ativos?.ecpf !== false,
        });
        result.checks_realizados++;
      }
    }

    // Employee-level validities
    const { data: employees, error: empError } = await supabase
      .from("employees")
      .select(
        "id, nome_completo, email, receber_alertas, cnv_data_validade, reciclagem_data_validade, porte_arma_validade, colete_data_validade, alertas_ativos"
      )
      .eq("company_id", companyId)
      .eq("status", "ativo");

    if (!empError && employees) {
      for (const emp of employees) {
        // CNV (ALWAYS checked — legal exception per R3)
        if (emp.cnv_data_validade) {
          const dias = diasRestantes(emp.cnv_data_validade);
          if (dias !== null) {
            validityChecks.push({
              tipo: "cnv",
              entidade_id: emp.id,
              entidade_tipo: "employee",
              company_id: companyId,
              data_validade: emp.cnv_data_validade,
              dias_restantes: dias,
              alertas_ativos: emp.alertas_ativos?.cnv !== false,
            });
            result.checks_realizados++;
          }
        }

        // Other employee checks (only if billing active)
        if (billingAtivo) {
          if (emp.reciclagem_data_validade) {
            const dias = diasRestantes(emp.reciclagem_data_validade);
            if (dias !== null) {
              validityChecks.push({
                tipo: "reciclagem",
                entidade_id: emp.id,
                entidade_tipo: "employee",
                company_id: companyId,
                data_validade: emp.reciclagem_data_validade,
                dias_restantes: dias,
                alertas_ativos: emp.alertas_ativos?.reciclagem !== false,
              });
              result.checks_realizados++;
            }
          }

          if (emp.porte_arma_validade) {
            const dias = diasRestantes(emp.porte_arma_validade);
            if (dias !== null) {
              validityChecks.push({
                tipo: "porte_arma",
                entidade_id: emp.id,
                entidade_tipo: "employee",
                company_id: companyId,
                data_validade: emp.porte_arma_validade,
                dias_restantes: dias,
                alertas_ativos: emp.alertas_ativos?.porte_arma !== false,
              });
              result.checks_realizados++;
            }
          }

          if (emp.colete_data_validade) {
            const dias = diasRestantes(emp.colete_data_validade);
            if (dias !== null) {
              validityChecks.push({
                tipo: "colete",
                entidade_id: emp.id,
                entidade_tipo: "employee",
                company_id: companyId,
                data_validade: emp.colete_data_validade,
                dias_restantes: dias,
                alertas_ativos: emp.alertas_ativos?.colete !== false,
              });
              result.checks_realizados++;
            }
          }
        }
      }
    }

    // Vehicle-level validities (only if billing active)
    if (billingAtivo) {
      const { data: vehicles, error: vehicleError } = await supabase
        .from("vehicles")
        .select(
          "id, placa, modelo, licenciamento_validade, seguro_validade, vistoria_pf_validade, tipo, alertas_ativos"
        )
        .eq("company_id", companyId)
        .eq("status", "ativo");

      if (!vehicleError && vehicles) {
        for (const v of vehicles) {
          if (v.licenciamento_validade) {
            const dias = diasRestantes(v.licenciamento_validade);
            if (dias !== null) {
              validityChecks.push({
                tipo: "licenciamento",
                entidade_id: v.id,
                entidade_tipo: "vehicle",
                company_id: companyId,
                data_validade: v.licenciamento_validade,
                dias_restantes: dias,
                alertas_ativos: v.alertas_ativos?.licenciamento !== false,
              });
              result.checks_realizados++;
            }
          }

          if (v.seguro_validade) {
            const dias = diasRestantes(v.seguro_validade);
            if (dias !== null) {
              validityChecks.push({
                tipo: "seguro",
                entidade_id: v.id,
                entidade_tipo: "vehicle",
                company_id: companyId,
                data_validade: v.seguro_validade,
                dias_restantes: dias,
                alertas_ativos: v.alertas_ativos?.seguro !== false,
              });
              result.checks_realizados++;
            }
          }

          if (v.tipo === "escolta" && v.vistoria_pf_validade) {
            const dias = diasRestantes(v.vistoria_pf_validade);
            if (dias !== null) {
              validityChecks.push({
                tipo: "vistoria_pf",
                entidade_id: v.id,
                entidade_tipo: "vehicle",
                company_id: companyId,
                data_validade: v.vistoria_pf_validade,
                dias_restantes: dias,
                alertas_ativos: v.alertas_ativos?.vistoria_pf !== false,
              });
              result.checks_realizados++;
            }
          }
        }
      }
    }

    // ──── STEP 4: Apply alert rules per PRD section 3.7 ────
    const alertas: AlertaPendente[] = [];

    for (const check of validityChecks) {
      if (!check) continue;

      const dias = check.dias_restantes;
      let template: "C" | "F" | null = null;
      let severidade = "";

      // Alert rules per PRD section 3.7
      if (dias <= 0) {
        template = "F"; // Template F (crítico)
        severidade = "critico";
      } else if (dias <= 5) {
        template = "F"; // Template F (crítico)
        severidade = "critico";
      } else if (dias <= 15) {
        template = "C"; // Template C (urgente tone)
        severidade = "urgente";
      } else if (dias <= 30) {
        template = "C"; // Template C (action required)
        severidade = "urgente";
      } else if (dias <= 60) {
        template = "C"; // Template C (reforçado)
        severidade = "atencao";
      } else if (dias <= 90) {
        template = "C"; // Template C (informativo)
        severidade = "informativo";
      }

      // Only send alert if template was determined (i.e., dias <= 90)
      if (template) {
        // ──── STEP 5: R9 - Check if alerts should be paused ────
        if (!check.alertas_ativos) {
          result.alertas_parados++;
          continue;
        }

        // Build alert
        let entidadeNome = "";
        if (check.entidade_tipo === "company") {
          entidadeNome = company.razao_social;
        } else if (check.entidade_tipo === "employee") {
          const emp = employees?.find((e) => e.id === check.entidade_id);
          entidadeNome = emp?.nome_completo || check.entidade_id;
        } else if (check.entidade_tipo === "vehicle") {
          entidadeNome = `Veículo ${check.entidade_id}`;
        }

        const tipoNome = getTipoNome(check.tipo);

        alertas.push({
          tipo: tipoNome,
          entidade: entidadeNome,
          campo: check.tipo,
          dias,
          template,
          dataValidade: check.data_validade,
          severidade,
        });
      }
    }

    // ──── STEP 6: Send appropriate email templates ────
    for (const alerta of alertas) {
      try {
        // 6a. Alerta para o responsável da empresa (sempre)
        await addEmailSendJob({
          companyId,
          templateId: alerta.template,
          mode: "CLIENTE_HTML",
          to: company.email_responsavel,
          subject: `[VIG PRO] ${alerta.severidade.toUpperCase()}: ${alerta.tipo} de ${alerta.entidade} — ${alerta.dias} dias`,
          payload: {
            razaoSocial: company.razao_social,
            tipoDocumento: alerta.tipo,
            entidadeNome: alerta.entidade,
            dataValidade: alerta.dataValidade,
            diasRestantes: alerta.dias,
            severidade: alerta.severidade,
          },
        });
        result.alertas_enviados++;

        // 6b. Alerta para o vigilante (quando autorizado pelo cliente)
        if (company.enviar_alerta_vigilante && alerta.campo !== "alvara") {
          const emp = employees?.find((e) => e.id === alerta.entidade || e.nome_completo === alerta.entidade);
          if (emp?.email && emp?.receber_alertas) {
            await addEmailSendJob({
              companyId,
              templateId: alerta.template,
              mode: "CLIENTE_HTML",
              to: emp.email,
              subject: `[VIG PRO] Alerta: ${alerta.tipo} — ${alerta.dias} dias para vencimento`,
              payload: {
                razaoSocial: company.razao_social,
                tipoDocumento: alerta.tipo,
                entidadeNome: emp.nome_completo,
                dataValidade: alerta.dataValidade,
                diasRestantes: alerta.dias,
                severidade: alerta.severidade,
              },
            });
          }
        }

        // In-app notification for compliance alert
        notifyComplianceExpiring(
          alerta.entidade,
          alerta.tipo,
          alerta.dias,
          companyId
        ).catch(() => {});
      } catch (err) {
        result.erros.push(
          `Erro ao enviar alerta ${alerta.tipo}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // ──── STEP 7: Log all actions to system_events ────
    if (alertas.length > 0 || result.alertas_parados > 0) {
      await supabase.from("system_events").insert({
        tipo: "compliance_check",
        severidade: alertas.length > 0 ? "warning" : "info",
        mensagem: `Compliance check: ${result.checks_realizados} verificados, ${result.alertas_enviados} alertas enviados, ${result.alertas_parados} alertas parados`,
        company_id: companyId,
      });
    }

    return result;
  } catch (err) {
    result.erros.push(
      `Erro geral no compliance: ${err instanceof Error ? err.message : String(err)}`
    );
    return result;
  }
}

/**
 * Helper — Check and update alertas_ativos for renewed validity
 * Called when a validity is updated/renewed
 * If novaValidade > 90 days: set alertas_ativos[campo] = false (stops alerts)
 * Else: keep alertas_ativos[campo] = true (keeps alerts active)
 */
export async function checkAndUpdateAlertas(
  companyId: string,
  tipo: "company" | "employee" | "vehicle",
  entidadeId: string,
  campo: string,
  novaValidade: string
): Promise<void> {
  const supabase = createSupabaseAdmin();

  try {
    const dias = diasRestantes(novaValidade);
    if (dias === null) return;

    const shouldDisable = dias > 90; // Disable alerts if > 90 days out

    if (tipo === "company") {
      const { data: company } = await supabase
        .from("companies")
        .select("alertas_ativos")
        .eq("id", entidadeId)
        .single();

      if (company) {
        const updated = { ...company.alertas_ativos, [campo]: !shouldDisable };
        await supabase
          .from("companies")
          .update({ alertas_ativos: updated })
          .eq("id", entidadeId);
      }
    } else if (tipo === "employee") {
      const { data: emp } = await supabase
        .from("employees")
        .select("alertas_ativos")
        .eq("id", entidadeId)
        .single();

      if (emp) {
        const updated = { ...emp.alertas_ativos, [campo]: !shouldDisable };
        await supabase
          .from("employees")
          .update({ alertas_ativos: updated })
          .eq("id", entidadeId);
      }
    } else if (tipo === "vehicle") {
      const { data: vehicle } = await supabase
        .from("vehicles")
        .select("alertas_ativos")
        .eq("id", entidadeId)
        .single();

      if (vehicle) {
        const updated = { ...vehicle.alertas_ativos, [campo]: !shouldDisable };
        await supabase
          .from("vehicles")
          .update({ alertas_ativos: updated })
          .eq("id", entidadeId);
      }
    }

  } catch (err) {
    console.error(
      `[COMPLIANCE] Erro ao atualizar alertas: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ──── Helpers ────

function getTipoNome(tipo: ValidityCheck["tipo"]): string {
  const nomes: Record<ValidityCheck["tipo"], string> = {
    cnv: "CNV",
    reciclagem: "Reciclagem",
    alvara: "Alvará de Funcionamento",
    porte_arma: "Porte de Arma",
    colete: "Colete Balístico",
    ecpf: "Certificado e-CPF A1",
    licenciamento: "Licenciamento",
    seguro: "Seguro Veículo",
    vistoria_pf: "Vistoria PF",
  };
  return nomes[tipo];
}

// For backwards compatibility
export async function checkComplianceEmpresa(companyId: string) {
  const result = await runComplianceCheck(companyId);
  return { alerts: result.alertas_enviados, total_checked: result.checks_realizados };
}
