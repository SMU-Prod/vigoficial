import { Text, Hr, Link, Button, Section } from "@react-email/components";
import { BaseLayout, NAVY, GOLD } from "./base-layout";
import * as React from "react";

interface TemplateOProps {
  razaoSocial: string;
  nomeResponsavel: string;
  cnpjEmpresa: string;
  cpfProcurador: string;
  nomeProcurador: string;
  prazoLimite: string;
  linkSuporte: string;
}

export default function TemplateO({
  razaoSocial = "Empresa Exemplo",
  nomeResponsavel = "Responsável",
  cnpjEmpresa = "00.000.000/0000-00",
  cpfProcurador = "000.000.000-00",
  nomeProcurador = "Procurador VIG PRO",
  prazoLimite = "15/04/2026",
  linkSuporte = "suporte@vigconsultoria.com",
}: TemplateOProps) {
  return (
    <BaseLayout previewText={`Cadastro de Procuração Eletrônica no GESP`}>
      <Text style={{ fontSize: "20px", fontWeight: "bold", color: NAVY, marginBottom: "16px" }}>
        Cadastro de Procuração Eletrônica no GESP
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6", marginBottom: "12px" }}>
        Olá, {nomeResponsavel}!
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6", marginBottom: "20px" }}>
        Para iniciar as operações do VIG PRO em sua empresa, é necessário conceder uma procuração eletrônica no GESP (Gerenciamento de Segurança Privada) junto à Polícia Federal. Este é um passo obrigatório e deve ser realizado pela empresa.
      </Text>

      <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

      <Text style={{ fontSize: "16px", fontWeight: "bold", color: NAVY, marginBottom: "16px" }}>
        Passo a passo para registrar a procuração:
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.8", marginBottom: "12px" }}>
        <strong>Passo 1:</strong> Acesse o GESP da Polícia Federal em{" "}
        <Link href="https://gesp.dpf.gov.br" style={{ color: GOLD }}>
          https://gesp.dpf.gov.br
        </Link>
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.8", marginBottom: "12px" }}>
        <strong>Passo 2:</strong> Faça login com o e-CNPJ (certificado digital) da empresa {razaoSocial}
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.8", marginBottom: "12px" }}>
        <strong>Passo 3:</strong> No menu lateral, acesse &ldquo;Empresa&rdquo; → &ldquo;Gerenciar Procuradores&rdquo;
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.8", marginBottom: "12px" }}>
        <strong>Passo 4:</strong> Clique em &ldquo;Incluir Procurador&rdquo; ou &ldquo;Novo&rdquo;
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.8", marginBottom: "12px" }}>
        <strong>Passo 5:</strong> Informe o CPF do procurador: <strong>{cpfProcurador}</strong> ({nomeProcurador})
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.8", marginBottom: "12px" }}>
        <strong>Passo 6:</strong> Selecione poderes <strong>&ldquo;Plenos&rdquo;</strong> (necessário para todas as operações da VIG Consultoria)
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.8", marginBottom: "20px" }}>
        <strong>Passo 7:</strong> Confirme e salve a procuração
      </Text>

      <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

      <Section
        style={{
          backgroundColor: "#FEF3C7",
          border: `1px solid #FCD34D`,
          borderRadius: "6px",
          padding: "16px",
          marginBottom: "20px",
        }}
      >
        <Text style={{ fontSize: "13px", color: "#92400E", lineHeight: "1.6", margin: 0 }}>
          <strong>⚠️ Importante:</strong> O cadastro deve ser realizado pela empresa <strong>{razaoSocial}</strong> utilizando
          o e-CNPJ <strong>{cnpjEmpresa}</strong>. A VIG Consultoria não pode realizar este cadastro em nome da empresa.
        </Text>
      </Section>

      <Section style={{ textAlign: "center" as const, marginBottom: "20px" }}>
        <Button
          href={linkSuporte}
          style={{
            backgroundColor: GOLD,
            color: "#000000",
            padding: "12px 32px",
            borderRadius: "6px",
            fontSize: "14px",
            fontWeight: "bold",
            textDecoration: "none",
            display: "inline-block",
            cursor: "pointer",
            border: "none",
          }}
        >
          Confirmar que a Procuração foi Cadastrada
        </Button>
      </Section>

      <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6", marginBottom: "12px" }}>
        <strong>Prazo para conclusão:</strong>
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6", marginBottom: "20px" }}>
        Por favor, realize o cadastro da procuração até <strong>{prazoLimite}</strong>. Após esta data, enviaremos um lembrete automático.
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6" }}>
        Em caso de dúvidas ou dificuldades durante o processo, entre em contato com nosso suporte:{" "}
        <Link href={`mailto:${linkSuporte}`} style={{ color: GOLD }}>
          {linkSuporte}
        </Link>
      </Text>

      <Text style={{ fontSize: "14px", color: GOLD, fontWeight: "bold", marginTop: "24px" }}>
        Agradecemos pela sua cooperação. A VIG Consultoria está pronta para servir.
      </Text>
    </BaseLayout>
  );
}
