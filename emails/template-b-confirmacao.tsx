import { Text, Hr } from "@react-email/components";
import { BaseLayout, NAVY, GOLD } from "./base-layout";
import * as React from "react";

interface TemplateBProps {
  razaoSocial: string;
  tipoAcao: string;
  descricao: string;
  protocoloGesp: string | null;
  dataExecucao: string;
  detalhes: string[];
  printUrl?: string;
}

/**
 * Template B — Confirmação de trabalho executado
 * PRD Regra R8: Todo trabalho gera Template B obrigatoriamente
 */
export default function TemplateB({
  razaoSocial = "Empresa Exemplo",
  tipoAcao = "Cadastro de Vigilante",
  descricao = "Vigilante João Silva cadastrado no GESP",
  protocoloGesp = "GESP-2026-001234",
  dataExecucao = "29/03/2026 às 14:32",
  detalhes = ["Nome: João da Silva Santos", "CPF: 123.456.789-00", "Função: Vigilante Patrimonial"],
}: TemplateBProps) {
  return (
    <BaseLayout previewText={`VIG PRO — Confirmação: ${tipoAcao}`}>
      <Text style={{ fontSize: "20px", fontWeight: "bold", color: NAVY, marginBottom: "8px" }}>
        Ação Executada com Sucesso
      </Text>

      <Text style={{ fontSize: "12px", color: GOLD, fontWeight: "bold", marginBottom: "16px" }}>
        {razaoSocial}
      </Text>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
        <tbody>
          <tr>
            <td style={{ padding: "8px 0", fontSize: "13px", color: "#6b7280", width: "140px" }}>Tipo de ação</td>
            <td style={{ padding: "8px 0", fontSize: "14px", color: "#111827", fontWeight: "bold" }}>{tipoAcao}</td>
          </tr>
          <tr>
            <td style={{ padding: "8px 0", fontSize: "13px", color: "#6b7280" }}>Descrição</td>
            <td style={{ padding: "8px 0", fontSize: "14px", color: "#111827" }}>{descricao}</td>
          </tr>
          <tr>
            <td style={{ padding: "8px 0", fontSize: "13px", color: "#6b7280" }}>Protocolo GESP</td>
            <td style={{ padding: "8px 0", fontSize: "14px", color: "#111827", fontFamily: "monospace" }}>
              {protocoloGesp || "N/A"}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "8px 0", fontSize: "13px", color: "#6b7280" }}>Data/hora</td>
            <td style={{ padding: "8px 0", fontSize: "14px", color: "#111827" }}>{dataExecucao}</td>
          </tr>
        </tbody>
      </table>

      {detalhes.length > 0 && (
        <>
          <Hr style={{ borderColor: "#e5e7eb", margin: "16px 0" }} />
          <Text style={{ fontSize: "14px", fontWeight: "bold", color: NAVY, marginBottom: "8px" }}>
            Detalhes
          </Text>
          {detalhes.map((d, i) => (
            <Text key={i} style={{ fontSize: "13px", color: "#374151", margin: "4px 0", lineHeight: "1.5" }}>
              • {d}
            </Text>
          ))}
        </>
      )}

      <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

      <Text style={{ fontSize: "12px", color: "#9ca3af", fontStyle: "italic" }}>
        Prints de evidência foram arquivados automaticamente.
        Em caso de dúvida, responda este email.
      </Text>
    </BaseLayout>
  );
}
