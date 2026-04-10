import { Text, Hr, Link } from "@react-email/components";
import { BaseLayout, NAVY, GOLD } from "./base-layout";
import * as React from "react";

interface ItemResumo {
  tipo: string;
  descricao: string;
}

interface TemplateIProps {
  razaoSocial: string;
  cnpj: string;
  dataPublicacao: string;
  tipoPublicacao: string;
  resumoPublicacao: string;
  itensDetectados: ItemResumo[];
  uf?: string;
  delegacia?: string;
  score: number;
  linkRelatorio: string;
  nomeContato?: string;
}

/**
 * Template I — Prospecção Consultiva via DOU
 * Tom: Consultivo premium. "Preparamos um relatório gratuito da situação
 * regulatória da sua empresa baseado nas publicações do DOU."
 */
export default function TemplateI({
  razaoSocial = "Empresa Exemplo LTDA",
  cnpj = "00.000.000/0000-00",
  dataPublicacao = "02/04/2026",
  tipoPublicacao = "Alvará de Autorização",
  resumoPublicacao = "Publicação detectada no DOU referente à sua empresa.",
  itensDetectados = [],
  uf,
  delegacia,
  linkRelatorio = "https://app.vigi.com.br/relatorio",
  nomeContato,
}: TemplateIProps) {
  const saudacao = nomeContato
    ? `Prezado(a) ${nomeContato},`
    : `Prezado(a) responsável,`;

  return (
    <BaseLayout previewText={`📊 Relatório regulatório gratuito — ${razaoSocial} — DOU ${dataPublicacao}`}>
      {/* Saudação */}
      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.7", marginBottom: "4px" }}>
        {saudacao}
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.7", marginBottom: "16px" }}>
        Identificamos uma publicação no <strong>Diário Oficial da União</strong> de{" "}
        <strong>{dataPublicacao}</strong> referente à empresa{" "}
        <strong>{razaoSocial}</strong> (CNPJ: {cnpj}).
      </Text>

      {/* Card da publicação */}
      <div
        style={{
          backgroundColor: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          padding: "16px 20px",
          marginBottom: "20px",
        }}
      >
        <Text style={{ fontSize: "11px", color: GOLD, fontWeight: "bold", margin: "0 0 4px 0", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>
          PUBLICAÇÃO DETECTADA
        </Text>
        <Text style={{ fontSize: "14px", color: NAVY, fontWeight: "bold", margin: "0 0 8px 0" }}>
          {tipoPublicacao}
        </Text>
        <Text style={{ fontSize: "13px", color: "#64748b", margin: "0", lineHeight: "1.5" }}>
          {resumoPublicacao}
        </Text>
        {delegacia && (
          <Text style={{ fontSize: "12px", color: "#94a3b8", margin: "8px 0 0 0" }}>
            Delegacia: {delegacia} {uf ? `(${uf})` : ""}
          </Text>
        )}
      </div>

      {/* Itens detectados */}
      {itensDetectados.length > 0 && (
        <div
          style={{
            backgroundColor: "#fffbeb",
            border: "1px solid #fde68a",
            borderRadius: "8px",
            padding: "14px 18px",
            marginBottom: "20px",
          }}
        >
          <Text style={{ fontSize: "12px", fontWeight: "bold", color: "#92400e", margin: "0 0 8px 0" }}>
            Itens regulatórios identificados:
          </Text>
          {itensDetectados.map((item, idx) => (
            <Text
              key={idx}
              style={{ fontSize: "13px", color: "#78350f", margin: idx === 0 ? "0" : "4px 0 0 0" }}
            >
              • {item.descricao}
            </Text>
          ))}
        </div>
      )}

      <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

      {/* Proposta de valor */}
      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.7" }}>
        Com base nesta e em outras publicações recentes do DOU, nossa equipe
        preparou um <strong>relatório gratuito da situação regulatória</strong> da
        sua empresa junto à Polícia Federal.
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.7", marginTop: "8px" }}>
        O relatório inclui:
      </Text>

      <div style={{ padding: "0 0 0 12px", marginBottom: "16px" }}>
        <Text style={{ fontSize: "13px", color: "#374151", lineHeight: "1.8", margin: "0" }}>
          → Status atual dos seus alvarás e prazos de validade
        </Text>
        <Text style={{ fontSize: "13px", color: "#374151", lineHeight: "1.8", margin: "0" }}>
          → CNVs dos seus vigilantes com datas de vencimento
        </Text>
        <Text style={{ fontSize: "13px", color: "#374151", lineHeight: "1.8", margin: "0" }}>
          → Pendências identificadas no GESP (PGDWeb)
        </Text>
        <Text style={{ fontSize: "13px", color: "#374151", lineHeight: "1.8", margin: "0" }}>
          → Comparativo com outras empresas do mesmo porte na sua região
        </Text>
      </div>

      {/* CTA principal */}
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
          Quero receber meu relatório gratuito
        </Link>
      </div>

      <Text style={{ fontSize: "13px", color: "#6b7280", lineHeight: "1.6", textAlign: "center" as const }}>
        Sem compromisso. Seu relatório estará disponível em até 24 horas.
      </Text>

      <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

      {/* Sobre a VIG Consultoria */}
      <div
        style={{
          backgroundColor: "#f0f4f8",
          borderRadius: "8px",
          padding: "16px 20px",
        }}
      >
        <Text style={{ fontSize: "13px", fontWeight: "bold", color: NAVY, margin: "0 0 8px 0" }}>
          Sobre a VIG Consultoria
        </Text>
        <Text style={{ fontSize: "12px", color: "#4b5563", lineHeight: "1.6", margin: "0" }}>
          A VIG Consultoria é uma plataforma de inteligência regulatória para empresas de
          segurança privada. Monitoramos automaticamente o DOU, GESP e CNVs para
          garantir que sua empresa esteja sempre em conformidade com a Polícia
          Federal, sem surpresas e sem atrasos.
        </Text>
      </div>

      <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

      <Text style={{ fontSize: "11px", color: "#9ca3af", lineHeight: "1.5" }}>
        Este email foi enviado porque identificamos uma publicação no DOU referente
        à sua empresa. Se não deseja receber comunicações, responda este email com
        &ldquo;REMOVER&rdquo;. Seus dados não serão compartilhados com terceiros.
      </Text>
    </BaseLayout>
  );
}
