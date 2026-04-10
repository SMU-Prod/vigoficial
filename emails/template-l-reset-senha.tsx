import { Text, Hr, Link } from "@react-email/components";
import { BaseLayout, NAVY } from "./base-layout";
import * as React from "react";

interface TemplateLProps {
  nomeUsuario: string;
  linkReset: string;
  expiracaoMinutos?: number;
}

/**
 * Template L — Reset de Senha
 * Security-focused password reset email
 */
export default function TemplateL({
  nomeUsuario = "João Silva",
  linkReset = "https://app.vigconsultoria.com/reset-senha",
  expiracaoMinutos = 30,
}: TemplateLProps) {
  return (
    <BaseLayout
      previewText={`VIG PRO — Redefinição de senha para ${nomeUsuario}`}
    >
      {/* Security icon header */}
      <div style={{ textAlign: "center" as const, marginBottom: "20px" }}>
        <Text style={{ fontSize: "32px", margin: 0 }}>🔐</Text>
      </div>

      {/* Main content */}
      <Text style={{ fontSize: "18px", fontWeight: "bold", color: NAVY, marginBottom: "16px", textAlign: "center" as const }}>
        Redefinição de Senha
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6", marginBottom: "16px" }}>
        Olá <strong>{nomeUsuario}</strong>,
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6", marginBottom: "20px" }}>
        Recebemos uma solicitação de redefinição de senha para sua conta VIG PRO. Clique no botão abaixo para criar uma nova senha. Este link expira em <strong>{expiracaoMinutos} minutos</strong>.
      </Text>

      <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

      {/* CTA Button */}
      <div style={{ textAlign: "center" as const, margin: "24px 0" }}>
        <Link
          href={linkReset}
          style={{
            backgroundColor: NAVY,
            color: "#ffffff",
            padding: "14px 32px",
            borderRadius: "8px",
            fontSize: "15px",
            fontWeight: "bold",
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          Redefinir minha senha
        </Link>
      </div>

      <Text style={{ fontSize: "12px", color: "#6b7280", textAlign: "center" as const, marginTop: "12px" }}>
        Ou copie e cole este link no seu navegador:
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
        {linkReset}
      </Text>

      <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

      {/* Warning footer */}
      <div
        style={{
          backgroundColor: "#fef3c7",
          border: "1px solid #fcd34d",
          borderRadius: "6px",
          padding: "12px 16px",
          marginBottom: "20px",
        }}
      >
        <Text style={{ fontSize: "13px", color: "#78350f", margin: 0, fontWeight: "bold", marginBottom: "4px" }}>
          ⚠ Segurança
        </Text>
        <Text style={{ fontSize: "12px", color: "#92400e", margin: 0, lineHeight: "1.5" }}>
          Se você não solicitou esta alteração, ignore este email. Sua senha permanecerá inalterada. Se acredita que sua conta foi comprometida, responda este email imediatamente.
        </Text>
      </div>

      <Text style={{ fontSize: "12px", color: "#9ca3af", lineHeight: "1.5" }}>
        Por motivos de segurança, este link expira em {expiracaoMinutos} minutos. Se não conseguir redefinir sua senha, entre em contato através do suporte.
      </Text>
    </BaseLayout>
  );
}
