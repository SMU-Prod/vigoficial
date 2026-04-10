import { Text, Hr, Link } from "@react-email/components";
import { BaseLayout, NAVY, GOLD } from "./base-layout";
import * as React from "react";

interface ItemLiberado {
  quantidade: number;
  descricao: string;
  tipo: string;
  calibre?: string;
}

interface TemplateHProps {
  razaoSocial: string;
  cnpj: string;
  tipoAlvara: string;
  subtipo?: string;
  dataPublicacao: string;
  itensLiberados: ItemLiberado[];
  validadeDias?: number;
  dataValidade?: string;
  numeroProcesso?: string;
  delegacia?: string;
  urlDou?: string;
  assinante?: string;
}

/**
 * Template H — Alerta de publicação no DOU
 * Notifica empresa que seu alvará foi publicado no Diário Oficial da União
 */
export default function TemplateH({
  razaoSocial = "Empresa Exemplo LTDA",
  cnpj = "00.000.000/0000-00",
  tipoAlvara = "CONCEDER",
  subtipo = "autorização",
  dataPublicacao = "27/03/2026",
  itensLiberados = [],
  validadeDias,
  dataValidade,
  numeroProcesso,
  delegacia,
  urlDou,
  assinante,
}: TemplateHProps) {
  const tipoConfig: Record<string, { cor: string; label: string; icone: string }> = {
    CONCEDER: { cor: "#10b981", label: "AUTORIZAÇÃO CONCEDIDA", icone: "✅" },
    DECLARAR: { cor: "#3b82f6", label: "DECLARAÇÃO PUBLICADA", icone: "📋" },
    CANCELAR: { cor: "#ef4444", label: "CANCELAMENTO PUBLICADO", icone: "⚠" },
    RENOVAR: { cor: "#8b5cf6", label: "RENOVAÇÃO PUBLICADA", icone: "🔄" },
  };

  const config = tipoConfig[tipoAlvara] || tipoConfig.CONCEDER;

  return (
    <BaseLayout previewText={`${config.icone} ${config.label} — ${razaoSocial} — DOU ${dataPublicacao}`}>
      {/* Banner do tipo */}
      <div
        style={{
          backgroundColor: config.cor,
          color: "#ffffff",
          padding: "14px 20px",
          borderRadius: "6px",
          marginBottom: "20px",
          textAlign: "center" as const,
        }}
      >
        <Text style={{ fontSize: "16px", fontWeight: "bold", margin: 0 }}>
          {config.icone} {config.label}
        </Text>
        <Text style={{ fontSize: "12px", margin: "4px 0 0 0", opacity: 0.9 }}>
          Diário Oficial da União — {dataPublicacao}
        </Text>
      </div>

      {/* Dados da empresa */}
      <Text style={{ fontSize: "12px", color: GOLD, fontWeight: "bold", marginBottom: "4px" }}>
        {razaoSocial}
      </Text>
      <Text style={{ fontSize: "12px", color: "#6b7280", marginBottom: "20px" }}>
        CNPJ: {cnpj}
      </Text>

      {/* Mensagem principal */}
      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6" }}>
        Informamos que foi publicado no Diário Oficial da União (Seção 1) de{" "}
        <strong>{dataPublicacao}</strong> um alvará referente à sua empresa.
      </Text>

      {subtipo && (
        <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6", marginTop: "8px" }}>
          Tipo: <strong>{tipoAlvara}</strong> — {subtipo}
        </Text>
      )}

      {/* Detalhes do alvará */}
      <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

      <Text style={{ fontSize: "13px", fontWeight: "bold", color: NAVY, marginBottom: "12px" }}>
        DETALHES DO ALVARÁ
      </Text>

      {/* Itens liberados */}
      {itensLiberados.length > 0 && (
        <>
          <Text style={{ fontSize: "12px", fontWeight: "bold", color: "#374151", marginBottom: "8px" }}>
            Itens autorizados:
          </Text>
          <div
            style={{
              backgroundColor: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              padding: "12px 16px",
              marginBottom: "16px",
            }}
          >
            {itensLiberados.map((item, idx) => (
              <Text
                key={idx}
                style={{
                  fontSize: "13px",
                  color: "#374151",
                  margin: idx === 0 ? "0" : "6px 0 0 0",
                  lineHeight: "1.5",
                }}
              >
                • {item.quantidade}x {item.descricao}
                {item.calibre ? ` (calibre ${item.calibre})` : ""}
              </Text>
            ))}
          </div>
        </>
      )}

      {/* Informações adicionais */}
      <div
        style={{
          backgroundColor: "#f0f9ff",
          border: "1px solid #bae6fd",
          borderRadius: "6px",
          padding: "12px 16px",
          marginBottom: "16px",
        }}
      >
        {validadeDias && (
          <Text style={{ fontSize: "13px", color: "#374151", margin: "0 0 4px 0" }}>
            <strong>Validade:</strong> {validadeDias} dias
            {dataValidade ? ` (até ${dataValidade})` : ""}
          </Text>
        )}
        {numeroProcesso && (
          <Text style={{ fontSize: "13px", color: "#374151", margin: "0 0 4px 0" }}>
            <strong>Processo:</strong> {numeroProcesso}
          </Text>
        )}
        {delegacia && (
          <Text style={{ fontSize: "13px", color: "#374151", margin: "0 0 4px 0" }}>
            <strong>Delegacia:</strong> {delegacia}
          </Text>
        )}
        {assinante && (
          <Text style={{ fontSize: "13px", color: "#374151", margin: 0 }}>
            <strong>Assinado por:</strong> {assinante}
          </Text>
        )}
      </div>

      {/* Link para DOU */}
      {urlDou && (
        <div style={{ textAlign: "center" as const, margin: "20px 0" }}>
          <Link
            href={urlDou}
            style={{
              backgroundColor: NAVY,
              color: "#ffffff",
              padding: "12px 24px",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "bold",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Ver publicação no DOU →
          </Link>
        </div>
      )}

      <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

      {/* CTA para VIG PRO */}
      <div
        style={{
          backgroundColor: "#fef9ee",
          border: `1px solid ${GOLD}`,
          borderRadius: "6px",
          padding: "16px",
          textAlign: "center" as const,
        }}
      >
        <Text style={{ fontSize: "14px", color: NAVY, fontWeight: "bold", margin: "0 0 8px 0" }}>
          Gerencie todos os seus alvarás em um só lugar
        </Text>
        <Text style={{ fontSize: "13px", color: "#374151", margin: "0 0 12px 0", lineHeight: "1.5" }}>
          O VIG PRO monitora automaticamente o DOU e mantém você informado
          sobre todas as publicações referentes à sua empresa.
        </Text>
        <Link
          href="https://app.vigconsultoria.com"
          style={{
            backgroundColor: GOLD,
            color: NAVY,
            padding: "10px 20px",
            borderRadius: "6px",
            fontSize: "13px",
            fontWeight: "bold",
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Acessar VIG PRO
        </Link>
      </div>

      <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

      <Text style={{ fontSize: "11px", color: "#9ca3af", lineHeight: "1.5" }}>
        Este alerta é enviado automaticamente pelo VIG PRO — Plataforma de Compliance
        para Segurança Privada. As informações foram extraídas diretamente do
        Diário Oficial da União e são fornecidas apenas para fins informativos.
        Consulte sempre o DOU oficial para confirmação.
      </Text>
    </BaseLayout>
  );
}
