import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

const NAVY = "#0B1F3A";
const GOLD = "#C8A75D";

interface BaseLayoutProps {
  children: React.ReactNode;
  previewText?: string;
}

export function BaseLayout({ children, previewText }: BaseLayoutProps) {
  return (
    <Html>
      <Head />
      {previewText && (
        <Text style={{ display: "none" }}>{previewText}</Text>
      )}
      <Body style={{ backgroundColor: "#f4f4f5", margin: 0, padding: 0, fontFamily: "Arial, sans-serif" }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", padding: "20px" }}>
          {/* Header */}
          <Section style={{ backgroundColor: NAVY, padding: "24px 32px", borderRadius: "8px 8px 0 0" }}>
            <Text style={{ color: "#ffffff", fontSize: "28px", fontWeight: "bold", margin: 0, letterSpacing: "2px" }}>
              VIG PRO
            </Text>
            <Text style={{ color: GOLD, fontSize: "11px", margin: "4px 0 0 0", letterSpacing: "1px" }}>
              Compliance · Intelligence · Security
            </Text>
          </Section>

          {/* Content */}
          <Section style={{ backgroundColor: "#ffffff", padding: "32px", borderRadius: "0 0 8px 8px" }}>
            {children}
          </Section>

          {/* Footer */}
          <Section style={{ padding: "20px 0", textAlign: "center" as const }}>
            <Text style={{ color: "#9ca3af", fontSize: "11px", margin: 0 }}>
              VIG PRO — Plataforma de Compliance para Segurança Privada
            </Text>
            <Text style={{ color: "#9ca3af", fontSize: "11px", margin: "4px 0 0 0" }}>
              operacoes@vigconsultoria.com | suporte@vigconsultoria.com
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export { NAVY, GOLD };
