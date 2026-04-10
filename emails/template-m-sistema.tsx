import { Text, Hr } from "@react-email/components";
import { BaseLayout, NAVY } from "./base-layout";
import * as React from "react";

interface TemplateMProps {
  razaoSocial?: string;
  tipo: "falha_gesp" | "manutencao" | "atualizacao" | "incidente";
  titulo: string;
  mensagem: string;
  detalheTecnico?: string;
  dataEvento: string;
  statusAtual: "resolvido" | "em_andamento" | "agendado";
}

/**
 * Template M — Notificação de Sistema / Falha
 * Color-coded system notifications for maintenance, updates, incidents
 */
export default function TemplateM({
  tipo = "incidente",
  titulo = "Notificação do Sistema",
  mensagem = "Uma situação foi identificada no sistema.",
  detalheTecnico,
  dataEvento = "03/04/2026 às 14:30",
  statusAtual = "em_andamento",
}: TemplateMProps) {
  const tipoConfig = {
    falha_gesp: {
      cor: "#dc2626",
      label: "FALHA NA SINCRONIZAÇÃO GESP",
      icone: "⚠",
      descricao: "Falha identificada na sincronização com GESP",
    },
    manutencao: {
      cor: "#f59e0b",
      label: "MANUTENÇÃO PROGRAMADA",
      icone: "🔧",
      descricao: "Manutenção programada do sistema",
    },
    atualizacao: {
      cor: "#3b82f6",
      label: "ATUALIZAÇÃO DO SISTEMA",
      icone: "⬆",
      descricao: "Nova versão disponível",
    },
    incidente: {
      cor: "#7f1d1d",
      label: "INCIDENTE IDENTIFICADO",
      icone: "🚨",
      descricao: "Um incidente foi identificado",
    },
  };

  const statusConfig = {
    resolvido: { cor: "#10b981", label: "RESOLVIDO", icone: "✓" },
    em_andamento: { cor: "#f59e0b", label: "EM ANDAMENTO", icone: "⏳" },
    agendado: { cor: "#3b82f6", label: "AGENDADO", icone: "📅" },
  };

  const config = tipoConfig[tipo];
  const statusBadge = statusConfig[statusAtual];

  return (
    <BaseLayout previewText={`${config.label} — ${titulo}`}>
      {/* Type header */}
      <div
        style={{
          backgroundColor: config.cor,
          color: "#ffffff",
          padding: "16px 20px",
          borderRadius: "8px 8px 0 0",
          marginBottom: "0",
        }}
      >
        <Text style={{ fontSize: "14px", fontWeight: "bold", margin: 0 }}>
          {config.icone} {config.label}
        </Text>
      </div>

      {/* Main content section */}
      <div style={{ backgroundColor: "#f9fafb", padding: "20px", borderRadius: "0 0 8px 8px", marginBottom: "20px" }}>
        <Text style={{ fontSize: "16px", fontWeight: "bold", color: NAVY, marginBottom: "8px" }}>
          {titulo}
        </Text>

        <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6", marginBottom: "16px" }}>
          {mensagem}
        </Text>

        {/* Status badge */}
        <div
          style={{
            backgroundColor: statusBadge.cor,
            color: "#ffffff",
            padding: "8px 12px",
            borderRadius: "4px",
            display: "inline-block",
            marginBottom: "12px",
          }}
        >
          <Text style={{ fontSize: "12px", fontWeight: "bold", margin: 0 }}>
            {statusBadge.icone} Status: {statusBadge.label}
          </Text>
        </div>

        {/* Event details table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "16px" }}>
          <tbody>
            <tr>
              <td style={{ padding: "8px 0", fontSize: "13px", color: "#6b7280", width: "140px" }}>
                Data/Hora
              </td>
              <td style={{ padding: "8px 0", fontSize: "14px", color: "#111827", fontFamily: "monospace" }}>
                {dataEvento}
              </td>
            </tr>
            <tr>
              <td style={{ padding: "8px 0", fontSize: "13px", color: "#6b7280" }}>
                Tipo
              </td>
              <td style={{ padding: "8px 0", fontSize: "14px", color: "#111827" }}>
                {config.descricao}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Technical details */}
      {detalheTecnico && (
        <>
          <Text style={{ fontSize: "13px", fontWeight: "bold", color: NAVY, marginBottom: "8px" }}>
            Detalhes Técnicos
          </Text>

          <div
            style={{
              backgroundColor: "#1f2937",
              color: "#e5e7eb",
              padding: "16px",
              borderRadius: "6px",
              marginBottom: "20px",
              fontFamily: "monospace",
              fontSize: "12px",
              lineHeight: "1.5",
              overflowX: "auto",
            }}
          >
            <Text style={{ color: "#e5e7eb", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {detalheTecnico}
            </Text>
          </div>
        </>
      )}

      <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

      {/* Impact message based on type and status */}
      <div
        style={{
          backgroundColor: "#f0f4f8",
          border: "1px solid #dbeafe",
          borderRadius: "6px",
          padding: "12px 16px",
          marginBottom: "20px",
        }}
      >
        {tipo === "falha_gesp" && (
          <Text style={{ fontSize: "13px", color: "#1e40af", lineHeight: "1.6", margin: 0 }}>
            {statusAtual === "resolvido"
              ? "A falha na sincronização foi resolvida. Os dados estão sendo sincronizados normalmente."
              : "Está havendo uma falha na sincronização com GESP. Estamos trabalhando para resolver. Os dados serão sincronizados quando o serviço estiver disponível."}
          </Text>
        )}

        {tipo === "manutencao" && (
          <Text style={{ fontSize: "13px", color: "#1e40af", lineHeight: "1.6", margin: 0 }}>
            {statusAtual === "agendado"
              ? "A manutenção está programada. O sistema permanecerá indisponível durante o período especificado."
              : "A manutenção está em andamento. Desculpe qualquer inconveniente. O sistema estará de volta em breve."}
          </Text>
        )}

        {tipo === "atualizacao" && (
          <Text style={{ fontSize: "13px", color: "#1e40af", lineHeight: "1.6", margin: 0 }}>
            Uma atualização do sistema foi implantada. Você pode encontrar as novidades no Centro de Ajuda.
          </Text>
        )}

        {tipo === "incidente" && (
          <Text style={{ fontSize: "13px", color: "#1e40af", lineHeight: "1.6", margin: 0 }}>
            {statusAtual === "resolvido"
              ? "O incidente foi resolvido. Operações normais foram retomadas."
              : "Um incidente está sendo investigado. Acompanhe as atualizações neste email."}
          </Text>
        )}
      </div>

      <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

      <Text style={{ fontSize: "12px", color: "#9ca3af", lineHeight: "1.5" }}>
        Para mais informações e atualizações, visite o{" "}
        <strong>Status do Sistema</strong> na plataforma VIG PRO ou entre em contato com nosso suporte técnico.
      </Text>
    </BaseLayout>
  );
}
