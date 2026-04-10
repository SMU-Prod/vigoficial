import { Text, Hr } from "@react-email/components";
import { BaseLayout, GOLD } from "./base-layout";
import * as React from "react";

interface TemplateCProps {
  razaoSocial: string;
  tipoDocumento: string;
  entidadeNome: string;
  dataValidade: string;
  diasRestantes: number;
  severidade: "informativo" | "atencao" | "urgente" | "critico";
}

/**
 * Template C — Alerta de validade (90/60/30/15 dias)
 * PRD Seção 3.7 — Motor de Validades e Compliance
 */
export default function TemplateC({
  razaoSocial = "Empresa Exemplo",
  tipoDocumento = "CNV",
  entidadeNome = "João da Silva Santos",
  dataValidade = "15/06/2026",
  diasRestantes = 60,
  severidade = "atencao",
}: TemplateCProps) {
  const severidadeConfig = {
    informativo: { cor: "#3b82f6", label: "INFORMATIVO", tom: "Informamos que" },
    atencao: { cor: "#f59e0b", label: "ATENÇÃO", tom: "Atenção:" },
    urgente: { cor: "#ef4444", label: "URGENTE", tom: "URGENTE:" },
    critico: { cor: "#dc2626", label: "CRÍTICO", tom: "⚠ AÇÃO IMEDIATA NECESSÁRIA:" },
  };

  const config = severidadeConfig[severidade];

  return (
    <BaseLayout previewText={`[${config.label}] ${tipoDocumento} vence em ${diasRestantes} dias — ${entidadeNome}`}>
      <div style={{ backgroundColor: config.cor, color: "#ffffff", padding: "12px 16px", borderRadius: "6px", marginBottom: "20px", textAlign: "center" as const }}>
        <Text style={{ fontSize: "14px", fontWeight: "bold", margin: 0 }}>
          {config.label} — {tipoDocumento} VENCE EM {diasRestantes} DIAS
        </Text>
      </div>

      <Text style={{ fontSize: "12px", color: GOLD, fontWeight: "bold", marginBottom: "16px" }}>
        {razaoSocial}
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6" }}>
        {config.tom} o documento <strong>{tipoDocumento}</strong> de{" "}
        <strong>{entidadeNome}</strong> vence em <strong>{dataValidade}</strong>{" "}
        ({diasRestantes} dias).
      </Text>

      {diasRestantes <= 30 && (
        <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6", marginTop: "12px" }}>
          Providencie a renovação o mais breve possível para evitar
          irregularidades junto à Polícia Federal.
        </Text>
      )}

      {diasRestantes <= 15 && (
        <>
          <Hr style={{ borderColor: config.cor, margin: "16px 0" }} />
          <Text style={{ fontSize: "14px", color: config.cor, fontWeight: "bold" }}>
            O prazo está muito próximo. Caso a renovação já tenha sido
            providenciada, responda este email com o comprovante e os
            alertas serão pausados automaticamente.
          </Text>
        </>
      )}

      <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

      <Text style={{ fontSize: "12px", color: "#9ca3af" }}>
        Este alerta é enviado automaticamente pelo VIG PRO.
        Quando a validade for renovada no sistema, os alertas param automaticamente.
      </Text>
    </BaseLayout>
  );
}
