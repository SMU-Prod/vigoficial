import { Text, Hr } from "@react-email/components";
import { BaseLayout, NAVY } from "./base-layout";
import * as React from "react";

interface TemplateEProps {
  razaoSocial: string;
  fromEmail: string;
  subject: string;
  bodyPreview: string;
  dadosExtraidos: string;
  workflowId: string;
}

/**
 * Template E — Caso desconhecido
 * PRD Regra R7: Demanda não mapeada → equipe@vigi.com.br
 */
export default function TemplateE({
  razaoSocial = "Empresa Exemplo",
  fromEmail = "contato@empresa.com.br",
  subject = "Assunto do email original",
  bodyPreview = "Corpo do email...",
  dadosExtraidos = "{}",
  workflowId = "wf-123",
}: TemplateEProps) {
  return (
    <BaseLayout previewText={`[CASO DESCONHECIDO] ${razaoSocial} — ${subject}`}>
      <div style={{ backgroundColor: "#fef3c7", padding: "12px 16px", borderRadius: "6px", marginBottom: "20px" }}>
        <Text style={{ fontSize: "14px", fontWeight: "bold", color: "#92400e", margin: 0 }}>
          CASO DESCONHECIDO — AÇÃO MANUAL NECESSÁRIA
        </Text>
      </div>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6" }}>
        O parser IA não conseguiu classificar a demanda abaixo com confiança
        suficiente. Análise manual necessária.
      </Text>

      <Hr style={{ borderColor: "#e5e7eb", margin: "16px 0" }} />

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
        <tbody>
          <tr>
            <td style={{ padding: "6px 0", fontSize: "13px", color: "#6b7280", width: "120px" }}>Empresa</td>
            <td style={{ padding: "6px 0", fontSize: "14px", color: NAVY, fontWeight: "bold" }}>{razaoSocial}</td>
          </tr>
          <tr>
            <td style={{ padding: "6px 0", fontSize: "13px", color: "#6b7280" }}>De</td>
            <td style={{ padding: "6px 0", fontSize: "14px", color: "#111827" }}>{fromEmail}</td>
          </tr>
          <tr>
            <td style={{ padding: "6px 0", fontSize: "13px", color: "#6b7280" }}>Assunto</td>
            <td style={{ padding: "6px 0", fontSize: "14px", color: "#111827", fontWeight: "bold" }}>{subject}</td>
          </tr>
          <tr>
            <td style={{ padding: "6px 0", fontSize: "13px", color: "#6b7280" }}>Workflow ID</td>
            <td style={{ padding: "6px 0", fontSize: "13px", color: "#6b7280", fontFamily: "monospace" }}>{workflowId}</td>
          </tr>
        </tbody>
      </table>

      <Text style={{ fontSize: "14px", fontWeight: "bold", color: NAVY }}>Email Original:</Text>
      <div style={{ backgroundColor: "#f9fafb", padding: "16px", borderRadius: "6px", border: "1px solid #e5e7eb", marginTop: "8px" }}>
        <Text style={{ fontSize: "13px", color: "#374151", lineHeight: "1.6", whiteSpace: "pre-wrap" as const, margin: 0 }}>
          {bodyPreview}
        </Text>
      </div>

      {dadosExtraidos !== "{}" && (
        <>
          <Text style={{ fontSize: "14px", fontWeight: "bold", color: NAVY, marginTop: "16px" }}>
            Dados extraídos pelo parser:
          </Text>
          <div style={{ backgroundColor: "#f0fdf4", padding: "12px", borderRadius: "6px", marginTop: "8px" }}>
            <Text style={{ fontSize: "12px", color: "#374151", fontFamily: "monospace", margin: 0, whiteSpace: "pre-wrap" as const }}>
              {dadosExtraidos}
            </Text>
          </div>
        </>
      )}
    </BaseLayout>
  );
}
