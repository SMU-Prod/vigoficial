import { Text, Hr } from "@react-email/components";
import { BaseLayout, NAVY } from "./base-layout";
import * as React from "react";

interface TemplateFProps {
  razaoSocial: string;
  tipoDocumento: string;
  entidadeNome: string;
  dataValidade: string;
  diasRestantes: number;
}

/**
 * Template F — Urgência crítica (5 dias ou menos)
 * PRD Seção 3.6 — Tom de emergência
 */
export default function TemplateF({
  razaoSocial = "Empresa Exemplo",
  tipoDocumento = "CNV",
  entidadeNome = "João da Silva Santos",
  dataValidade = "03/04/2026",
  diasRestantes = 5,
}: TemplateFProps) {
  return (
    <BaseLayout previewText={`⚠ URGÊNCIA: ${tipoDocumento} de ${entidadeNome} vence em ${diasRestantes} dias`}>
      <div style={{ backgroundColor: "#dc2626", color: "#ffffff", padding: "16px", borderRadius: "6px", marginBottom: "20px", textAlign: "center" as const }}>
        <Text style={{ fontSize: "18px", fontWeight: "bold", margin: 0 }}>
          URGÊNCIA CRÍTICA
        </Text>
        <Text style={{ fontSize: "14px", margin: "8px 0 0 0" }}>
          {tipoDocumento} VENCE EM {diasRestantes} DIA{diasRestantes !== 1 ? "S" : ""}
        </Text>
      </div>

      <Text style={{ fontSize: "12px", color: "#C8A75D", fontWeight: "bold", marginBottom: "16px" }}>
        {razaoSocial}
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6" }}>
        O documento <strong>{tipoDocumento}</strong> de{" "}
        <strong>{entidadeNome}</strong> vence em{" "}
        <strong style={{ color: "#dc2626" }}>{dataValidade}</strong>.
      </Text>

      <Text style={{ fontSize: "14px", color: "#dc2626", fontWeight: "bold", lineHeight: "1.6", marginTop: "16px" }}>
        AÇÃO IMEDIATA NECESSÁRIA para evitar irregularidade junto à
        Polícia Federal e possível autuação.
      </Text>

      <Hr style={{ borderColor: "#fecaca", margin: "20px 0" }} />

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6" }}>
        Se a renovação já foi providenciada, responda este email com o
        comprovante. Os alertas serão pausados automaticamente assim que
        a nova validade for registrada no sistema.
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6", marginTop: "12px" }}>
        Se precisar de ajuda, entre em contato imediatamente:
      </Text>
      <Text style={{ fontSize: "14px", color: NAVY, fontWeight: "bold" }}>
        urgencias@vigconsultoria.com
      </Text>
    </BaseLayout>
  );
}
