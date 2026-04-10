"use client";

import { useState } from "react";

// ─── Portal do Cliente: Documentos e Relatórios ───

interface Documento {
  id: string;
  tipo: string;
  periodo: string;
  gerado_em: string;
  formato: "pdf" | "excel";
}

function IconDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default function DocumentosPage() {
  const [docs] = useState<Documento[]>([
    { id: "1", tipo: "Relatório Mensal", periodo: "2026-03", gerado_em: "2026-04-01T08:00:00Z", formato: "pdf" },
    { id: "2", tipo: "Relatório Mensal", periodo: "2026-02", gerado_em: "2026-03-01T08:00:00Z", formato: "pdf" },
    { id: "3", tipo: "Relatório de Vigilantes", periodo: "2026-03", gerado_em: "2026-04-01T08:00:00Z", formato: "excel" },
    { id: "4", tipo: "Relatório de Compliance", periodo: "2026-03", gerado_em: "2026-04-01T08:00:00Z", formato: "pdf" },
    { id: "5", tipo: "Relatório Mensal", periodo: "2026-01", gerado_em: "2026-02-01T08:00:00Z", formato: "pdf" },
  ]);

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
        Relatórios gerados automaticamente pelo VIG PRO. Novos relatórios são disponibilizados no início de cada mês.
      </p>

      <div className="space-y-2">
        {docs.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between rounded-lg border p-4 transition-colors"
            style={{ background: "var(--bg-secondary)", borderColor: "var(--border-primary)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-secondary)"; }}
          >
            <div className="flex items-center gap-3">
              <span
                className="text-[11px] font-bold uppercase px-2 py-1 rounded"
                style={{
                  background: doc.formato === "pdf" ? "var(--status-danger-bg)" : "var(--status-success-bg)",
                  color: doc.formato === "pdf" ? "var(--status-danger)" : "var(--status-success)",
                }}
              >
                {doc.formato}
              </span>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{doc.tipo}</p>
                <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                  Período: {doc.periodo} · Gerado em {new Date(doc.gerado_em).toLocaleDateString("pt-BR")}
                </p>
              </div>
            </div>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
              style={{ color: "var(--vigi-gold)", background: "var(--vigi-gold-muted)" }}
              onClick={() => {
                window.open(`/api/relatorios?tipo=mensal&mes=${doc.periodo}&formato=${doc.formato}`, "_blank");
              }}
            >
              <IconDownload />
              Baixar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
