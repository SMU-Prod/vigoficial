import { Text, Hr, Link } from "@react-email/components";
import { BaseLayout, NAVY, GOLD } from "./base-layout";
import * as React from "react";

interface TemplateNProps {
  nomeConvidado: string;
  emailConvidado: string;
  nomeEmpresa: string;
  role: "admin" | "operador" | "viewer";
  nomeConvidadoPor: string;
  linkConvite: string;
  expiracaoDias?: number;
}

/**
 * Template N — Convite de Usuário
 * User invitation with role explanation
 */
export default function TemplateN({
  nomeConvidado = "Maria Silva",
  nomeEmpresa = "Segurança Total LTDA",
  role = "operador",
  nomeConvidadoPor = "João Santos",
  linkConvite = "https://app.vigconsultoria.com/convite",
  expiracaoDias = 7,
}: TemplateNProps) {
  const roleConfig = {
    admin: {
      descricao: "Acesso total à plataforma, gestão de usuários e configurações.",
      icone: "👨‍💼",
    },
    operador: {
      descricao: "Acesso completo às funcionalidades operacionais da plataforma.",
      icone: "👷",
    },
    viewer: {
      descricao: "Acesso somente para visualização de relatórios e dados.",
      icone: "👁",
    },
  };

  const config = roleConfig[role];

  return (
    <BaseLayout
      previewText={`VIG PRO — ${nomeConvidadoPor} convidou você para o VIG PRO`}
    >
      {/* Welcome icon */}
      <div style={{ textAlign: "center" as const, marginBottom: "20px" }}>
        <Text style={{ fontSize: "32px", margin: 0 }}>{config.icone}</Text>
      </div>

      {/* Main content */}
      <Text style={{ fontSize: "18px", fontWeight: "bold", color: NAVY, marginBottom: "16px", textAlign: "center" as const }}>
        Você foi convidado para o VIG PRO
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6", marginBottom: "16px" }}>
        Olá <strong>{nomeConvidado}</strong>,
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6", marginBottom: "20px" }}>
        <strong>{nomeConvidadoPor}</strong> convidou você para acessar o VIG PRO como <strong>{role}</strong> da empresa <strong>{nomeEmpresa}</strong>.
      </Text>

      <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

      {/* Role explanation card */}
      <div
        style={{
          backgroundColor: "#f0f4f8",
          border: "1px solid #dbeafe",
          borderRadius: "8px",
          padding: "16px 20px",
          marginBottom: "20px",
        }}
      >
        <Text style={{ fontSize: "13px", fontWeight: "bold", color: NAVY, margin: "0 0 8px 0", textTransform: "capitalize" as const }}>
          Permissões de {role}
        </Text>
        <Text style={{ fontSize: "13px", color: "#4b5563", lineHeight: "1.6", margin: 0 }}>
          {config.descricao}
        </Text>
      </div>

      {/* CTA Button */}
      <div style={{ textAlign: "center" as const, margin: "24px 0" }}>
        <Link
          href={linkConvite}
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
          Aceitar convite
        </Link>
      </div>

      <Text style={{ fontSize: "12px", color: "#6b7280", textAlign: "center" as const, marginTop: "12px" }}>
        Ou copie este link no seu navegador:
      </Text>

      <Text
        style={{
          fontSize: "11px",
          color: "#6b7280",
          textAlign: "center" as const,
          marginTop: "8px",
          wordBreak: "break-all",
          fontFamily: "monospace",
        }}
      >
        {linkConvite}
      </Text>

      <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

      {/* Expiration notice */}
      <div
        style={{
          backgroundColor: "#fef3c7",
          border: "1px solid #fcd34d",
          borderRadius: "6px",
          padding: "12px 16px",
          marginBottom: "20px",
        }}
      >
        <Text style={{ fontSize: "12px", color: "#92400e", margin: 0, lineHeight: "1.5" }}>
          📌 Este convite expira em <strong>{expiracaoDias} dias</strong>. Aceite o convite antes dessa data para ativar sua conta.
        </Text>
      </div>

      {/* Additional info */}
      <Text style={{ fontSize: "12px", color: "#9ca3af", lineHeight: "1.5" }}>
        Após aceitar o convite, você receberá instruções para configurar sua senha e acessar a plataforma VIG PRO. Se tiver dúvidas ou não esperava por este convite, entre em contato com <strong>{nomeConvidadoPor}</strong> ou com nosso suporte.
      </Text>

      <Text style={{ fontSize: "12px", color: "#9ca3af", lineHeight: "1.5", marginTop: "12px" }}>
        <strong>VIG PRO</strong> — Plataforma de Compliance e Inteligência para Segurança Privada
      </Text>
    </BaseLayout>
  );
}
