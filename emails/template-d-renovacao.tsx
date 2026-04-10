import { Text, Hr } from "@react-email/components";
import { BaseLayout, NAVY, GOLD } from "./base-layout";
import * as React from "react";

interface TemplateDProps {
  razaoSocial: string;
  emailEmpresa: string;
  dataRenovacao: string;
  valorMensal: string;
  // Resumo do mês (PRD Seção 4.3)
  vigilantesMonitorados: number;
  renovacoesCnv: number;
  divergenciasResolvidas: number;
  alertasEnviados: number;
  postosCadastrados: number;
  transportesExecutados: number;
  armasProcessadas: number;
  alertasManutencao: number;
}

/**
 * Template D — Renovação + Captação (dupla função)
 * PRD Seção 4.3 — Aviso de renovação + material para encaminhamento
 */
export default function TemplateD({
  razaoSocial = "Empresa Exemplo",
  emailEmpresa = "contato@empresa.com.br",
  dataRenovacao = "10/04/2026",
  valorMensal = "R$ 497,00",
  vigilantesMonitorados = 45,
  renovacoesCnv = 3,
  divergenciasResolvidas = 1,
  alertasEnviados = 12,
  postosCadastrados = 2,
  transportesExecutados = 0,
  armasProcessadas = 0,
  alertasManutencao = 4,
}: TemplateDProps) {
  return (
    <BaseLayout previewText={`VIG PRO — Renovação ${dataRenovacao} + Resumo do mês`}>
      <Text style={{ fontSize: "20px", fontWeight: "bold", color: NAVY, marginBottom: "8px" }}>
        Renovação de Assinatura
      </Text>

      <Text style={{ fontSize: "12px", color: GOLD, fontWeight: "bold", marginBottom: "16px" }}>
        {razaoSocial}
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6" }}>
        Sua assinatura VIG PRO será renovada em <strong>{dataRenovacao}</strong>,
        no valor de <strong>{valorMensal}</strong>.
      </Text>

      <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

      <Text style={{ fontSize: "16px", fontWeight: "bold", color: NAVY, marginBottom: "12px" }}>
        Resumo do Mês
      </Text>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {[
            [`${vigilantesMonitorados} vigilantes monitorados`, "100% de conformidade"],
            [`${renovacoesCnv} renovações de CNV`, "realizadas automaticamente"],
            [`${divergenciasResolvidas} divergências GESP`, "detectadas e resolvidas"],
            [`${alertasEnviados} alertas de vencimento`, "enviados antes do prazo"],
            [`${postosCadastrados} postos de serviço`, "cadastrados e atualizados"],
            [`${transportesExecutados} comunicados de transporte`, "executados"],
            [`${armasProcessadas} ocorrências de armas`, "processadas"],
            [`${alertasManutencao} alertas de manutenção`, "de frota emitidos"],
          ].map(([valor, desc], i) => (
            <tr key={i}>
              <td style={{ padding: "6px 0", fontSize: "14px", color: NAVY, fontWeight: "bold" }}>
                ✓ {valor}
              </td>
              <td style={{ padding: "6px 0", fontSize: "13px", color: "#6b7280" }}>
                {desc}
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ padding: "8px 0", fontSize: "14px", color: "#16a34a", fontWeight: "bold" }} colSpan={2}>
              ✓ 0 prazos perdidos junto à Polícia Federal
            </td>
          </tr>
        </tbody>
      </table>

      <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

      {/* Seção de captação — para encaminhamento */}
      <div style={{ backgroundColor: "#f8fafc", padding: "20px", borderRadius: "8px", border: `1px solid ${GOLD}` }}>
        <Text style={{ fontSize: "14px", fontWeight: "bold", color: NAVY, marginBottom: "8px" }}>
          Conheça o VIG PRO — Compliance Automático para Segurança Privada
        </Text>
        <Text style={{ fontSize: "13px", color: "#374151", lineHeight: "1.6" }}>
          O VIG PRO é o único sistema que automatiza 100% das obrigações burocráticas
          exigidas pela Polícia Federal para empresas de segurança privada.
          Do GESP ao DOU, do cadastro de vigilante ao colete balístico.
        </Text>
        <Text style={{ fontSize: "13px", color: "#374151", lineHeight: "1.6" }}>
          Zero prazos perdidos. Zero multas por desconformidade.
        </Text>
        <Text style={{ fontSize: "13px", color: GOLD, fontWeight: "bold", marginTop: "12px" }}>
          Contato comercial: comercial@vigconsultoria.com
        </Text>
      </div>

      <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

      <Text style={{ fontSize: "11px", color: "#9ca3af", textAlign: "center" as const }}>
        Cliente indicador: {razaoSocial} — {emailEmpresa}
      </Text>
    </BaseLayout>
  );
}
