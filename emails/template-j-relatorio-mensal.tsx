import { Text, Hr, Link } from "@react-email/components";
import { BaseLayout, NAVY, GOLD } from "./base-layout";
import * as React from "react";

interface ResumoItem {
  label: string;
  valor: string | number;
}

interface TemplateJProps {
  razaoSocial: string;
  cnpj: string;
  mesReferencia: string;
  resumoItens: ResumoItem[];
  linkRelatorio: string;
  nomeContato?: string;
  totalVigilantes?: number;
  validadesCriticas?: number;
  validadesUrgentes?: number;
  processosGesp?: number;
}

/**
 * Template J — Relatório Mensal Automático
 * Enviado no início de cada mês com resumo operacional e link para download.
 * Tom: Profissional, direto. "Seu relatório mensal está disponível."
 */
export default function TemplateJ({
  razaoSocial = "Empresa Exemplo LTDA",
  cnpj = "00.000.000/0000-00",
  mesReferencia = "Março/2026",
  resumoItens = [],
  linkRelatorio = "https://app.vigi.com.br/relatorio",
  nomeContato,
  totalVigilantes = 0,
  validadesCriticas = 0,
  validadesUrgentes = 0,
  processosGesp = 0,
}: TemplateJProps) {
  const saudacao = nomeContato
    ? `Prezado(a) ${nomeContato},`
    : `Prezado(a) responsável,`;

  return (
    <BaseLayout previewText={`Relatório mensal ${mesReferencia} — ${razaoSocial}`}>
      {/* Saudação */}
      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.7", marginBottom: "4px" }}>
        {saudacao}
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.7", marginBottom: "20px" }}>
        O relatório mensal referente a <strong>{mesReferencia}</strong> da empresa{" "}
        <strong>{razaoSocial}</strong> (CNPJ: {cnpj}) está disponível para consulta.
      </Text>

      {/* Resumo operacional */}
      <div
        style={{
          backgroundColor: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "16px 20px",
          marginBottom: "20px",
        }}
      >
        <Text style={{ fontSize: "11px", color: GOLD, fontWeight: "bold", margin: "0 0 12px 0", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>
          RESUMO DO PERÍODO
        </Text>

        <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
          <tbody>
            <tr>
              <td style={{ padding: "6px 0", fontSize: "13px", color: "#64748b" }}>Vigilantes ativos</td>
              <td style={{ padding: "6px 0", fontSize: "13px", color: NAVY, fontWeight: "bold", textAlign: "right" as const }}>{totalVigilantes}</td>
            </tr>
            <tr style={{ borderTop: "1px solid #e2e8f0" }}>
              <td style={{ padding: "6px 0", fontSize: "13px", color: "#64748b" }}>Validades críticas</td>
              <td style={{ padding: "6px 0", fontSize: "13px", color: validadesCriticas > 0 ? "#ef4444" : "#10b981", fontWeight: "bold", textAlign: "right" as const }}>{validadesCriticas}</td>
            </tr>
            <tr style={{ borderTop: "1px solid #e2e8f0" }}>
              <td style={{ padding: "6px 0", fontSize: "13px", color: "#64748b" }}>Validades urgentes</td>
              <td style={{ padding: "6px 0", fontSize: "13px", color: validadesUrgentes > 0 ? "#f59e0b" : "#10b981", fontWeight: "bold", textAlign: "right" as const }}>{validadesUrgentes}</td>
            </tr>
            <tr style={{ borderTop: "1px solid #e2e8f0" }}>
              <td style={{ padding: "6px 0", fontSize: "13px", color: "#64748b" }}>Processos GESP pendentes</td>
              <td style={{ padding: "6px 0", fontSize: "13px", color: NAVY, fontWeight: "bold", textAlign: "right" as const }}>{processosGesp}</td>
            </tr>
            {resumoItens.map((item, idx) => (
              <tr key={idx} style={{ borderTop: "1px solid #e2e8f0" }}>
                <td style={{ padding: "6px 0", fontSize: "13px", color: "#64748b" }}>{item.label}</td>
                <td style={{ padding: "6px 0", fontSize: "13px", color: NAVY, fontWeight: "bold", textAlign: "right" as const }}>{item.valor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Alertas se houver validades críticas */}
      {validadesCriticas > 0 && (
        <div
          style={{
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            padding: "14px 18px",
            marginBottom: "20px",
          }}
        >
          <Text style={{ fontSize: "13px", fontWeight: "bold", color: "#991b1b", margin: "0 0 4px 0" }}>
            Atenção: {validadesCriticas} validade{validadesCriticas > 1 ? "s" : ""} em situação crítica
          </Text>
          <Text style={{ fontSize: "12px", color: "#b91c1c", margin: "0" }}>
            Existem documentos com vencimento próximo que exigem ação imediata.
            Consulte o relatório completo para detalhes.
          </Text>
        </div>
      )}

      {/* CTA */}
      <div style={{ textAlign: "center" as const, margin: "24px 0" }}>
        <Link
          href={linkRelatorio}
          style={{
            backgroundColor: GOLD,
            color: NAVY,
            padding: "14px 32px",
            borderRadius: "8px",
            fontSize: "15px",
            fontWeight: "bold",
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Baixar relatório completo
        </Link>
      </div>

      <Text style={{ fontSize: "12px", color: "#6b7280", lineHeight: "1.6", textAlign: "center" as const }}>
        O relatório está disponível nos formatos PDF e Excel.
      </Text>

      <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

      <Text style={{ fontSize: "11px", color: "#9ca3af", lineHeight: "1.5" }}>
        Este relatório é gerado automaticamente pelo VIG PRO no início de cada mês.
        Se tiver dúvidas, responda este email ou acesse o portal do cliente.
      </Text>
    </BaseLayout>
  );
}
