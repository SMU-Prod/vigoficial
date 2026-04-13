/**
 * Contract Service — VIG PRO
 *
 * Gerencia ciclo de vida do contrato:
 * - Criação com vencimento 30 dias após 1º pagamento
 * - Auto-renovação mensal
 * - Verificação diária de expiração
 *
 * Integrado ao billing worker (billingDiario).
 */

import { createSupabaseAdmin } from "@/lib/supabase/server";
import { addEmailSendJob } from "@/lib/queue/jobs";
import { notifySystem } from "@/lib/services/notification-service";

/**
 * Ativa contrato após confirmação do primeiro pagamento.
 * Define contrato_inicio = hoje, contrato_vencimento = hoje + 30d.
 */
export async function ativarContrato(companyId: string): Promise<void> {
  const supabase = createSupabaseAdmin();

  const hoje = new Date();
  const vencimento = new Date(hoje);
  vencimento.setDate(vencimento.getDate() + 30);

  const hojeStr = hoje.toISOString().split("T")[0];
  const vencimentoStr = vencimento.toISOString().split("T")[0];

  await supabase
    .from("companies")
    .update({
      contrato_inicio: hojeStr,
      contrato_vencimento: vencimentoStr,
      contrato_auto_renovacao: true,
      habilitada: true,
      billing_status: "ativo",
    })
    .eq("id", companyId);

  // Registra evento
  await supabase.from("system_events").insert({
    tipo: "contrato_ativado",
    severidade: "info",
    mensagem: `Contrato ativado. Vencimento: ${vencimentoStr}`,
    company_id: companyId,
  });
}

/**
 * Renova contrato automaticamente por mais 30 dias.
 * Chamado pelo billing quando pagamento é confirmado e auto_renovacao = true.
 */
export async function renovarContrato(companyId: string): Promise<void> {
  const supabase = createSupabaseAdmin();

  const { data: company } = await supabase
    .from("companies")
    .select("contrato_vencimento, contrato_auto_renovacao, razao_social")
    .eq("id", companyId)
    .single();

  if (!company || !company.contrato_auto_renovacao) return;

  const novoVencimento = new Date();
  novoVencimento.setDate(novoVencimento.getDate() + 30);
  const novoVencimentoStr = novoVencimento.toISOString().split("T")[0];

  await supabase
    .from("companies")
    .update({ contrato_vencimento: novoVencimentoStr })
    .eq("id", companyId);

  await supabase.from("system_events").insert({
    tipo: "contrato_renovado",
    severidade: "info",
    mensagem: `Contrato renovado até ${novoVencimentoStr}`,
    company_id: companyId,
  });
}

/**
 * Verifica contratos que vencem nos próximos dias e envia alertas.
 * Chamado diariamente pelo billing worker.
 *
 * Alertas: 15d, 7d, 3d, 1d antes do vencimento.
 */
export async function verificarVencimentosContrato(): Promise<{ alertas: number }> {
  const supabase = createSupabaseAdmin();
  const hoje = new Date();
  let alertas = 0;

  const thresholds = [15, 7, 3, 1]; // dias antes do vencimento

  for (const dias of thresholds) {
    const target = new Date(hoje);
    target.setDate(target.getDate() + dias);
    const targetStr = target.toISOString().split("T")[0];

    const { data: companies } = await supabase
      .from("companies")
      .select("id, razao_social, email_responsavel, contrato_vencimento, contrato_auto_renovacao")
      .eq("habilitada", true)
      .eq("contrato_vencimento", targetStr);

    if (!companies) continue;

    for (const company of companies) {
      if (company.contrato_auto_renovacao) {
        // Auto-renovação ativa: aviso informativo
        await addEmailSendJob({
          companyId: company.id,
          templateId: "D",
          mode: "CLIENTE_HTML",
          to: company.email_responsavel,
          subject: `[VIG PRO] Contrato renova automaticamente em ${dias} dia(s)`,
          payload: {
            razaoSocial: company.razao_social,
            dataRenovacao: new Date(company.contrato_vencimento + "T12:00:00").toLocaleDateString("pt-BR"),
            autoRenovacao: true,
            diasRestantes: dias,
          },
        });
      } else {
        // Sem auto-renovação: alerta de expiração
        await addEmailSendJob({
          companyId: company.id,
          templateId: "D",
          mode: "CLIENTE_HTML",
          to: company.email_responsavel,
          subject: `[VIG PRO] Contrato vence em ${dias} dia(s) — Ação necessária`,
          payload: {
            razaoSocial: company.razao_social,
            dataRenovacao: new Date(company.contrato_vencimento + "T12:00:00").toLocaleDateString("pt-BR"),
            autoRenovacao: false,
            diasRestantes: dias,
          },
        });

        if (dias === 1) {
          notifySystem(
            `Contrato vence amanhã: ${company.razao_social}`,
            "Sem auto-renovação — contrato será encerrado",
            "danger"
          ).catch(() => {});
        }
      }

      alertas++;
    }
  }

  return { alertas };
}
