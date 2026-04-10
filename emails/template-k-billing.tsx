import { Text, Hr, Link } from "@react-email/components";
import { BaseLayout, NAVY, GOLD } from "./base-layout";
import * as React from "react";

interface TemplateKProps {
  razaoSocial: string;
  plano: string;
  valorMensal: string;
  dataVencimento: string;
  linkBoleto?: string;
  statusPagamento: "pendente" | "pago" | "atrasado" | "falhou";
  tentativasFalhas?: number;
}

/**
 * Template K — Fatura Gerada / Pagamento
 * Notifica sobre geração de fatura com status variável
 */
export default function TemplateK({
  razaoSocial = "Empresa Exemplo",
  plano = "Plano Essencial",
  valorMensal = "R$ 497,00",
  dataVencimento = "15/04/2026",
  linkBoleto,
  statusPagamento = "pendente",
  tentativasFalhas = 0,
}: TemplateKProps) {
  const statusConfig = {
    pendente: {
      cor: "#3b82f6",
      label: "FATURA PENDENTE",
      icone: "📄",
      titulo: `Sua fatura de ${valorMensal} foi gerada`,
      descricao: `O vencimento é ${dataVencimento}.`,
    },
    pago: {
      cor: "#10b981",
      label: "PAGAMENTO CONFIRMADO",
      icone: "✓",
      titulo: "Pagamento confirmado!",
      descricao: "Obrigado por manter sua assinatura em dia.",
    },
    atrasado: {
      cor: "#f59e0b",
      label: "FATURA EM ATRASO",
      icone: "⚠",
      titulo: "Sua fatura está em atraso",
      descricao: `Vencimento: ${dataVencimento}. Por favor, regularize sua situação.`,
    },
    falhou: {
      cor: "#ef4444",
      label: "FALHA NO PAGAMENTO",
      icone: "✕",
      titulo: "Não conseguimos processar seu pagamento",
      descricao: "Atualize seus dados de pagamento para evitar interrupção do serviço.",
    },
  };

  const config = statusConfig[statusPagamento];

  return (
    <BaseLayout previewText={`VIG PRO — ${config.label} — ${razaoSocial}`}>
      {/* Status badge */}
      <div
        style={{
          backgroundColor: config.cor,
          color: "#ffffff",
          padding: "12px 16px",
          borderRadius: "6px",
          marginBottom: "20px",
          textAlign: "center" as const,
        }}
      >
        <Text style={{ fontSize: "14px", fontWeight: "bold", margin: 0 }}>
          {config.icone} {config.label}
        </Text>
      </div>

      {/* Company name */}
      <Text style={{ fontSize: "12px", color: GOLD, fontWeight: "bold", marginBottom: "16px" }}>
        {razaoSocial}
      </Text>

      {/* Main content */}
      <Text style={{ fontSize: "18px", fontWeight: "bold", color: NAVY, marginBottom: "8px" }}>
        {config.titulo}
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6", marginBottom: "20px" }}>
        {config.descricao}
      </Text>

      {/* Billing details table */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
        <tbody>
          <tr>
            <td style={{ padding: "8px 0", fontSize: "13px", color: "#6b7280", width: "140px" }}>
              Plano
            </td>
            <td style={{ padding: "8px 0", fontSize: "14px", color: "#111827", fontWeight: "bold" }}>
              {plano}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "8px 0", fontSize: "13px", color: "#6b7280" }}>
              Valor mensal
            </td>
            <td style={{ padding: "8px 0", fontSize: "14px", color: "#111827", fontWeight: "bold" }}>
              {valorMensal}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "8px 0", fontSize: "13px", color: "#6b7280" }}>
              Vencimento
            </td>
            <td style={{ padding: "8px 0", fontSize: "14px", color: "#111827" }}>
              {dataVencimento}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Tentativas de falha */}
      {statusPagamento === "falhou" && tentativasFalhas && tentativasFalhas > 0 && (
        <>
          <div
            style={{
              backgroundColor: "#fee2e2",
              border: "1px solid #fecaca",
              borderRadius: "6px",
              padding: "12px 16px",
              marginBottom: "20px",
            }}
          >
            <Text style={{ fontSize: "13px", color: "#7f1d1d", margin: 0 }}>
              Tentativas falhadas: {tentativasFalhas}. Atualize seus dados para tentar novamente.
            </Text>
          </div>
        </>
      )}

      <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

      {/* CTA */}
      {statusPagamento === "pendente" && linkBoleto && (
        <div style={{ textAlign: "center" as const, margin: "24px 0" }}>
          <Link
            href={linkBoleto}
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
            Acessar Boleto
          </Link>
          <Text style={{ fontSize: "12px", color: "#6b7280", marginTop: "12px" }}>
            Clique para gerar ou baixar seu boleto
          </Text>
        </div>
      )}

      {statusPagamento === "falhou" && (
        <div style={{ textAlign: "center" as const, margin: "24px 0" }}>
          <Link
            href="https://app.vigconsultoria.com/configuracoes/pagamento"
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
            Atualizar dados de pagamento
          </Link>
        </div>
      )}

      {statusPagamento === "atrasado" && linkBoleto && (
        <div style={{ textAlign: "center" as const, margin: "24px 0" }}>
          <Link
            href={linkBoleto}
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
            Regularizar pagamento
          </Link>
        </div>
      )}

      <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

      <Text style={{ fontSize: "12px", color: "#9ca3af", lineHeight: "1.5" }}>
        {statusPagamento === "pago" && (
          "Sua assinatura continua ativa. Obrigado pela preferência."
        )}
        {statusPagamento === "pendente" && (
          "Esta é uma notificação de fatura. Seu acesso ao VIG PRO permanecerá ativo até a data de vencimento."
        )}
        {statusPagamento === "atrasado" && (
          "O acesso ao VIG PRO será suspenso se não regularizar o pagamento em breve."
        )}
        {statusPagamento === "falhou" && (
          "Seu acesso ao VIG PRO será suspenso se não atualizar seus dados de pagamento."
        )}
      </Text>
    </BaseLayout>
  );
}
