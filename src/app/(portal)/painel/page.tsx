"use client";

import { useState, useEffect } from "react";
import { formatDate } from "@/lib/formatters";

// ─── Portal do Cliente: Painel Principal ───
// Visão resumida do status da empresa para o responsável

interface CompanyOverview {
  razao_social: string;
  cnpj: string;
  alvara_validade: string | null;
  ecpf_validade: string | null;
  billing_status: string;
  vigilantes_total: number;
  vigilantes_ativos: number;
  validades_criticas: number;
  validades_urgentes: number;
  processos_pendentes: number;
  ultimo_sync_gesp: string | null;
}

export default function PainelPage() {
  const [overview, setOverview] = useState<CompanyOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO(portal-v1): Replace with actual API call using auth context company_id
    // fetch("/api/portal/overview").then(...)
    setLoading(false);
    setOverview({
      razao_social: "Empresa Exemplo Segurança Ltda",
      cnpj: "12.345.678/0001-90",
      alvara_validade: "2026-12-15",
      ecpf_validade: "2027-03-01",
      billing_status: "ativo",
      vigilantes_total: 47,
      vigilantes_ativos: 42,
      validades_criticas: 2,
      validades_urgentes: 5,
      processos_pendentes: 3,
      ultimo_sync_gesp: "2026-04-03T08:00:00Z",
    });
  }, []);

  if (loading || !overview) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-lg animate-pulse" style={{ background: "var(--bg-tertiary)" }} />
        ))}
      </div>
    );
  }

  const diasAlvara = overview.alvara_validade
    ? Math.ceil((new Date(overview.alvara_validade).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div className="space-y-6">
      {/* Company header */}
      <div className="rounded-lg border p-5" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-primary)" }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{overview.razao_social}</h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-tertiary)" }}>CNPJ: {overview.cnpj}</p>
          </div>
          <span
            className="text-[11px] font-medium uppercase px-3 py-1 rounded-full"
            style={{
              background: overview.billing_status === "ativo" ? "var(--status-success-bg)" : "var(--status-warning-bg)",
              color: overview.billing_status === "ativo" ? "var(--status-success)" : "var(--status-warning)",
            }}
          >
            {overview.billing_status}
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Alvará",
            value: diasAlvara !== null ? `${diasAlvara} dias` : "—",
            sub: overview.alvara_validade ? `Vence ${formatDate(overview.alvara_validade)}` : "Sem data",
            color: diasAlvara !== null && diasAlvara <= 30 ? "var(--status-danger)" : "var(--status-success)",
          },
          {
            label: "Vigilantes",
            value: `${overview.vigilantes_ativos}/${overview.vigilantes_total}`,
            sub: "Ativos / Total",
            color: "var(--text-primary)",
          },
          {
            label: "Validades Críticas",
            value: String(overview.validades_criticas),
            sub: `${overview.validades_urgentes} urgentes`,
            color: overview.validades_criticas > 0 ? "var(--status-danger)" : "var(--status-success)",
          },
          {
            label: "Processos GESP",
            value: String(overview.processos_pendentes),
            sub: overview.ultimo_sync_gesp ? `Sync: ${formatDate(overview.ultimo_sync_gesp)}` : "Sem sync",
            color: "var(--text-primary)",
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-lg border p-4"
            style={{ background: "var(--bg-secondary)", borderColor: "var(--border-primary)" }}
          >
            <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
              {kpi.label}
            </p>
            <p className="text-2xl font-semibold mt-1" style={{ color: kpi.color }}>
              {kpi.value}
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              {kpi.sub}
            </p>
          </div>
        ))}
      </div>

      {/* Quick info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border p-5" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-primary)" }}>
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>Próximos Vencimentos</h3>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            As validades da sua empresa são monitoradas automaticamente. Você receberá alertas por email quando prazos estiverem se aproximando.
          </p>
          <a href="/validades" className="inline-block mt-3 text-sm font-medium" style={{ color: "var(--vigi-gold)" }}>
            Ver todas as validades →
          </a>
        </div>

        <div className="rounded-lg border p-5" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-primary)" }}>
          <h3 className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>Documentos e Relatórios</h3>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            Relatórios mensais são gerados automaticamente e enviados por email. Você pode baixar versões anteriores a qualquer momento.
          </p>
          <a href="/documentos" className="inline-block mt-3 text-sm font-medium" style={{ color: "var(--vigi-gold)" }}>
            Ver documentos →
          </a>
        </div>
      </div>
    </div>
  );
}
