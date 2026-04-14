"use client";

import { useState, useEffect } from "react";
import { formatDate } from "@/lib/formatters";

// ─── Portal do Cliente: Validades ───

interface Validade {
  tipo: string;
  entidade: string;
  data_validade: string;
  dias_restantes: number;
  severidade: string;
}

const SEVERIDADE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  critico: { bg: "var(--status-danger-bg)", color: "var(--status-danger)", label: "Crítico" },
  urgente: { bg: "var(--status-warning-bg)", color: "var(--status-warning)", label: "Urgente" },
  acao: { bg: "var(--status-info-bg)", color: "var(--status-info)", label: "Ação" },
  atencao: { bg: "var(--bg-tertiary)", color: "var(--text-secondary)", label: "Atenção" },
  informativo: { bg: "var(--bg-tertiary)", color: "var(--text-tertiary)", label: "OK" },
};

export default function ValidadesPage() {
  const [validades, setValidades] = useState<Validade[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    // TODO(portal-v1): Replace with actual API call to fetch company validity dates
    setLoading(false);
    setValidades([
      { tipo: "Alvará", entidade: "Empresa", data_validade: "2026-12-15", dias_restantes: 257, severidade: "informativo" },
      { tipo: "CNV", entidade: "João Silva", data_validade: "2026-05-10", dias_restantes: 37, severidade: "acao" },
      { tipo: "CNV", entidade: "Maria Santos", data_validade: "2026-04-15", dias_restantes: 12, severidade: "urgente" },
      { tipo: "Reciclagem", entidade: "Pedro Oliveira", data_validade: "2026-04-08", dias_restantes: 5, severidade: "critico" },
      { tipo: "Colete", entidade: "Ana Costa", data_validade: "2026-06-20", dias_restantes: 78, severidade: "informativo" },
      { tipo: "Porte de Arma", entidade: "Carlos Lima", data_validade: "2026-05-25", dias_restantes: 52, severidade: "atencao" },
      { tipo: "Licenciamento", entidade: "ABC-1234", data_validade: "2026-04-20", dias_restantes: 17, severidade: "acao" },
    ]);
  }, []);

  const filtered = filter === "all" ? validades : validades.filter((v) => v.severidade === filter);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 rounded-lg animate-pulse" style={{ background: "var(--bg-tertiary)" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { value: "all", label: "Todas" },
          { value: "critico", label: "Críticas" },
          { value: "urgente", label: "Urgentes" },
          { value: "acao", label: "Ação" },
        ].map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className="px-3 py-1.5 text-sm rounded-md transition-colors"
            style={{
              background: filter === f.value ? "var(--vigi-gold-muted)" : "var(--bg-secondary)",
              color: filter === f.value ? "var(--vigi-gold)" : "var(--text-secondary)",
              border: "1px solid",
              borderColor: filter === f.value ? "var(--vigi-gold)" : "var(--border-primary)",
              fontWeight: filter === f.value ? 500 : 400,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border-primary)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--bg-tertiary)", borderBottom: "1px solid var(--border-primary)" }}>
              {["Tipo", "Entidade", "Vencimento", "Dias Restantes", "Status"].map((h) => (
                <th key={h} className="py-2.5 px-4 text-left text-[12px] font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8" style={{ color: "var(--text-tertiary)" }}>Nenhuma validade encontrada</td></tr>
            ) : filtered.map((v, i) => {
              const sev = SEVERIDADE_STYLES[v.severidade] || SEVERIDADE_STYLES.informativo;
              return (
                <tr
                  key={i}
                  style={{ borderBottom: "1px solid var(--border-secondary)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <td className="py-3 px-4 font-medium" style={{ color: "var(--text-primary)" }}>{v.tipo}</td>
                  <td className="py-3 px-4" style={{ color: "var(--text-secondary)" }}>{v.entidade}</td>
                  <td className="py-3 px-4" style={{ color: "var(--text-secondary)" }}>{formatDate(v.data_validade)}</td>
                  <td className="py-3 px-4 font-mono text-[13px]" style={{ color: sev.color }}>{v.dias_restantes}d</td>
                  <td className="py-3 px-4">
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: sev.bg, color: sev.color }}>
                      {sev.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
