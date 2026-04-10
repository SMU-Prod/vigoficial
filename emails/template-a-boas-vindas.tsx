import { Text, Hr } from "@react-email/components";
import { BaseLayout, NAVY, GOLD } from "./base-layout";
import * as React from "react";

interface TemplateAProps {
  razaoSocial: string;
  nomeResponsavel: string;
  plano: string;
  emailOperacional: string;
}

export default function TemplateA({
  razaoSocial = "Empresa Exemplo",
  nomeResponsavel = "Responsável",
  plano = "Starter",
  emailOperacional = "operacoes@vigconsultoria.com",
}: TemplateAProps) {
  return (
    <BaseLayout previewText={`Bem-vindo ao VIG PRO, ${razaoSocial}!`}>
      <Text style={{ fontSize: "20px", fontWeight: "bold", color: NAVY, marginBottom: "16px" }}>
        Bem-vindo ao VIG PRO!
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6" }}>
        Olá, {nomeResponsavel}!
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6" }}>
        A empresa <strong>{razaoSocial}</strong> foi habilitada com sucesso no VIG PRO,
        plano <strong>{plano}</strong>.
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6" }}>
        A partir de agora, todo o compliance da sua empresa com a Polícia Federal
        será gerenciado automaticamente pelo VIG PRO. Aqui está o que você precisa saber:
      </Text>

      <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

      <Text style={{ fontSize: "16px", fontWeight: "bold", color: NAVY }}>
        Como enviar demandas
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.8" }}>
        Envie emails para <strong>{emailOperacional}</strong> com palavras-chave
        claras no assunto. Exemplos:
      </Text>

      <Text style={{ fontSize: "13px", color: "#6b7280", lineHeight: "2", fontFamily: "monospace" }}>
        • Novo vigilante — João Silva — admissão 01/04/2026{"\n"}
        • Renovação CNV — Maria Santos — vence 15/05/2026{"\n"}
        • Novo posto — Sede Norte — São Paulo — 10 vigilantes{"\n"}
        • URGENTE — Autuação PF — prazo hoje
      </Text>

      <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

      <Text style={{ fontSize: "16px", fontWeight: "bold", color: NAVY }}>
        O que o VIG PRO faz automaticamente
      </Text>

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.8" }}>
        ✓ Atualiza o GESP junto à Polícia Federal{"\n"}
        ✓ Monitora validades de CNV, alvará, reciclagem, coletes{"\n"}
        ✓ Envia alertas 90, 60, 30, 15 e 5 dias antes do vencimento{"\n"}
        ✓ Gera ofícios para DELESP automaticamente{"\n"}
        ✓ Confirma cada ação executada por email com prints{"\n"}
        ✓ Lê o DOU diariamente para detectar publicações relevantes
      </Text>

      <Hr style={{ borderColor: "#e5e7eb", margin: "20px 0" }} />

      <Text style={{ fontSize: "14px", color: "#374151" }}>
        Contatos VIG PRO:
      </Text>
      <Text style={{ fontSize: "13px", color: "#6b7280", lineHeight: "1.8" }}>
        Solicitações: operacoes@vigconsultoria.com{"\n"}
        Suporte: suporte@vigconsultoria.com{"\n"}
        Urgências: urgencias@vigconsultoria.com
      </Text>

      <Text style={{ fontSize: "14px", color: GOLD, fontWeight: "bold", marginTop: "24px" }}>
        Zero prazos perdidos. Zero multas por desconformidade.
      </Text>
    </BaseLayout>
  );
}
