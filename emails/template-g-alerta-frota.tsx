import { Text, Hr } from "@react-email/components";
import { BaseLayout, NAVY, GOLD } from "./base-layout";
import * as React from "react";

interface TemplateGProps {
  razaoSocial: string;
  placa: string;
  modelo: string;
  tipoManutencao: string;
  kmAtual: number;
  kmLimite: number;
  kmRestantes: number;
  dataLimite?: string;
}

/**
 * Template G — Alerta manutenção de frota
 * PRD Seção 3.5 — Gestão de Frota
 */
export default function TemplateG({
  razaoSocial = "Empresa Exemplo",
  placa = "ABC-1234",
  modelo = "Fiat Strada 2023",
  tipoManutencao = "Troca de óleo",
  kmAtual = 9200,
  kmLimite = 10000,
  kmRestantes = 800,
  dataLimite,
}: TemplateGProps) {
  return (
    <BaseLayout previewText={`VIG PRO Frota — ${tipoManutencao} para ${placa} em ${kmRestantes} km`}>
      <Text style={{ fontSize: "20px", fontWeight: "bold", color: NAVY, marginBottom: "8px" }}>
        Alerta de Manutenção — Frota
      </Text>

      <Text style={{ fontSize: "12px", color: GOLD, fontWeight: "bold", marginBottom: "16px" }}>
        {razaoSocial}
      </Text>

      <div style={{ backgroundColor: "#fef3c7", padding: "16px", borderRadius: "6px", marginBottom: "20px" }}>
        <Text style={{ fontSize: "14px", fontWeight: "bold", color: "#92400e", margin: 0 }}>
          {tipoManutencao.toUpperCase()} — {kmRestantes} km restantes
        </Text>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px" }}>
        <tbody>
          <tr>
            <td style={{ padding: "8px 0", fontSize: "13px", color: "#6b7280", width: "140px" }}>Veículo</td>
            <td style={{ padding: "8px 0", fontSize: "14px", color: "#111827", fontWeight: "bold" }}>{modelo}</td>
          </tr>
          <tr>
            <td style={{ padding: "8px 0", fontSize: "13px", color: "#6b7280" }}>Placa</td>
            <td style={{ padding: "8px 0", fontSize: "14px", color: "#111827", fontFamily: "monospace" }}>{placa}</td>
          </tr>
          <tr>
            <td style={{ padding: "8px 0", fontSize: "13px", color: "#6b7280" }}>KM Atual</td>
            <td style={{ padding: "8px 0", fontSize: "14px", color: "#111827" }}>{kmAtual.toLocaleString("pt-BR")} km</td>
          </tr>
          <tr>
            <td style={{ padding: "8px 0", fontSize: "13px", color: "#6b7280" }}>Limite {tipoManutencao}</td>
            <td style={{ padding: "8px 0", fontSize: "14px", color: "#111827" }}>{kmLimite.toLocaleString("pt-BR")} km</td>
          </tr>
          <tr>
            <td style={{ padding: "8px 0", fontSize: "13px", color: "#6b7280" }}>KM Restantes</td>
            <td style={{ padding: "8px 0", fontSize: "14px", color: "#dc2626", fontWeight: "bold" }}>
              {kmRestantes.toLocaleString("pt-BR")} km
            </td>
          </tr>
          {dataLimite && (
            <tr>
              <td style={{ padding: "8px 0", fontSize: "13px", color: "#6b7280" }}>Data limite</td>
              <td style={{ padding: "8px 0", fontSize: "14px", color: "#111827" }}>{dataLimite}</td>
            </tr>
          )}
        </tbody>
      </table>

      <Hr style={{ borderColor: "#e5e7eb", margin: "16px 0" }} />

      <Text style={{ fontSize: "14px", color: "#374151", lineHeight: "1.6" }}>
        Providencie a manutenção preventiva para garantir a segurança
        da operação. Após a realização, envie email para{" "}
        <strong>operacoes@vigconsultoria.com</strong> com os dados do serviço
        (tipo, KM, valor, oficina) para atualização no sistema.
      </Text>
    </BaseLayout>
  );
}
