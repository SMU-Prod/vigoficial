"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatDateTime } from "@/lib/formatters";

// ─── Types ───────────────────────────────────────────────────────────────────

type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";
type ApprovalUrgency = "low" | "normal" | "high" | "critical";

interface GespApproval {
  id: string;
  company_id: string;
  process_code: string;
  process_name: string;
  agent_name: string;
  agent_run_id: string;
  payload: Record<string, unknown>;
  urgency: ApprovalUrgency;
  status: ApprovalStatus;
  admin_notes: string | null;
  requested_at: string;
  decided_at: string | null;
  expires_at: string | null;
}

interface Company {
  id: string;
  razao_social: string;
  cnpj: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const URGENCY_BADGE: Record<ApprovalUrgency, { label: string; variant: "red" | "yellow" | "blue" | "gray" }> = {
  critical: { label: "Crítico", variant: "red" },
  high:     { label: "Alta",    variant: "yellow" },
  normal:   { label: "Normal",  variant: "blue" },
  low:      { label: "Baixa",   variant: "gray" },
};

const STATUS_BADGE: Record<ApprovalStatus, { label: string; variant: "yellow" | "green" | "red" | "gray" }> = {
  pending:  { label: "Aguardando", variant: "yellow" },
  approved: { label: "Aprovado",   variant: "green" },
  rejected: { label: "Rejeitado",  variant: "red" },
  expired:  { label: "Expirado",   variant: "gray" },
};

function timeRemaining(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Expirado";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}h ${m}m restantes`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GespApprovalsPage() {
  const [approvals, setApprovals] = useState<GespApproval[]>([]);
  const [companies, setCompanies] = useState<Record<string, Company>>({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/gesp-approvals?tab=${tab}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Falha ao carregar aprovações");
        const data = await res.json();
        setApprovals(data.approvals ?? []);
        setCompanies(data.companies ?? {});
      } catch {
        // abort silencioso
      } finally {
        setLoading(false);
      }
    }

    load();

    let interval: ReturnType<typeof setInterval> | null = null;
    if (tab === "pending") {
      interval = setInterval(load, 10_000);
    }

    return () => {
      controller.abort();
      if (interval) clearInterval(interval);
    };
  }, [tab, refreshKey]);

  async function handleDecision(approvalId: string, decision: "approved" | "rejected") {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/gesp-approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, decision, notes }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(`Erro: ${err.error ?? "Falha ao processar decisão"}`);
        return;
      }

      setSelectedId(null);
      setNotes("");
      refresh();
    } finally {
      setActionLoading(false);
    }
  }

  const selected = approvals.find((a) => a.id === selectedId) ?? null;
  const pendingCount = approvals.filter((a) => a.status === "pending").length;

  return (
    <div className="space-y-6">

      {/* ── Cabeçalho ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--vigi-navy)]">Aprovações GESP</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Toda ação no GESP requer sua aprovação antes da execução.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-[var(--status-danger-bg)] text-[var(--status-danger)] animate-pulse">
              {pendingCount} aguardando
            </span>
          )}
          <button
            onClick={refresh}
            className="px-4 py-2 text-sm font-medium text-[var(--vigi-navy)] bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            Atualizar
          </button>
        </div>
      </div>

      {/* ── Tabs + conteúdo ── */}
      <Tabs
        defaultValue="pending"
        value={tab}
        onValueChange={(v) => { setTab(v as "pending" | "history"); setSelectedId(null); }}
      >
        <TabsList>
          <TabsTrigger value="pending">
            Pendentes
            {pendingCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[var(--status-danger)] text-white">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        {(["pending", "history"] as const).map((tabValue) => (
          <TabsContent key={tabValue} value={tabValue} className="p-0 bg-transparent rounded-none">

            <div className="flex gap-6 mt-4">

              {/* ── Lista ── */}
              <div className="flex-1 min-w-0">
                {loading ? (
                  <div className="bg-[var(--bg-secondary)] rounded-[var(--radius-lg)] border border-[var(--border-primary)] shadow-[var(--shadow-sm)]">
                    <div className="py-12 text-center text-[var(--text-tertiary)] text-sm">
                      Carregando...
                    </div>
                  </div>
                ) : approvals.length === 0 ? (
                  <div className="bg-[var(--bg-secondary)] rounded-[var(--radius-lg)] border border-[var(--border-primary)] shadow-[var(--shadow-sm)]">
                    <EmptyState
                      icon={tabValue === "pending" ? "✅" : "📋"}
                      title={tabValue === "pending" ? "Nenhuma aprovação pendente" : "Nenhum histórico encontrado"}
                      description={tabValue === "pending"
                        ? "Todas as ações GESP foram processadas. Você será notificado ao chegar novas solicitações."
                        : "Ainda não há decisões registradas nesta conta."}
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {approvals.map((approval) => {
                      const company = companies[approval.company_id];
                      const isSelected = selectedId === approval.id;
                      const urgency = URGENCY_BADGE[approval.urgency];
                      const isCritical = approval.urgency === "critical";

                      return (
                        <div
                          key={approval.id}
                          onClick={() => setSelectedId(isSelected ? null : approval.id)}
                          className={`rounded-[var(--radius-lg)] border p-4 cursor-pointer transition-all ${
                            isSelected
                              ? "border-[var(--vigi-gold)] bg-[var(--status-warning-bg)] shadow-[var(--shadow-md)]"
                              : isCritical
                              ? "border-[var(--status-danger)] bg-[var(--status-danger-bg)] hover:shadow-[var(--shadow-sm)]"
                              : "border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--border-focus)] hover:shadow-[var(--shadow-sm)]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              {/* Badges de urgência e status */}
                              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                <Badge variant={urgency.variant}>{urgency.label}</Badge>
                                <Badge variant={STATUS_BADGE[approval.status].variant}>
                                  {STATUS_BADGE[approval.status].label}
                                </Badge>
                                {isCritical && approval.status === "pending" && (
                                  <span className="text-xs font-semibold text-[var(--status-danger)] animate-pulse">
                                    ⚡ Prazo crítico
                                  </span>
                                )}
                              </div>

                              {/* Nome do processo */}
                              <p className="font-semibold text-[var(--vigi-navy)] truncate">
                                {approval.process_name}
                              </p>

                              {/* Empresa */}
                              <p className="text-sm text-[var(--text-secondary)] truncate mt-0.5">
                                {company?.razao_social ?? approval.company_id}
                                {company?.cnpj && (
                                  <span className="ml-2 text-[var(--text-tertiary)] text-xs">{company.cnpj}</span>
                                )}
                              </p>

                              {/* Metadados */}
                              <div className="flex items-center gap-2 mt-1.5 text-xs text-[var(--text-tertiary)]">
                                <span>Agente: {approval.agent_name}</span>
                                <span>·</span>
                                <span>{formatDateTime(approval.requested_at)}</span>
                                {approval.expires_at && approval.status === "pending" && (
                                  <>
                                    <span>·</span>
                                    <span className={isCritical ? "text-[var(--status-danger)] font-semibold" : ""}>
                                      {timeRemaining(approval.expires_at)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Painel de detalhes ── */}
              {selected && (
                <div className="w-96 flex-shrink-0">
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] p-5 sticky top-6 space-y-4">

                    {/* Título + código */}
                    <div>
                      <h2 className="font-bold text-[var(--vigi-navy)] text-lg leading-tight">
                        {selected.process_name}
                      </h2>
                      <p className="text-xs text-[var(--text-tertiary)] mt-1">
                        Código:{" "}
                        <code className="bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded-[var(--radius-xs)] font-mono text-[var(--text-secondary)]">
                          {selected.process_code}
                        </code>
                      </p>
                    </div>

                    {/* Alerta crítico */}
                    {selected.urgency === "critical" && selected.status === "pending" && (
                      <div className="p-3 bg-[var(--status-danger-bg)] border border-[var(--status-danger)] rounded-[var(--radius-md)]">
                        <p className="text-sm font-semibold text-[var(--status-danger)]">
                          ⚡ Prazo crítico de 24 horas
                        </p>
                        {selected.expires_at && (
                          <p className="text-xs text-[var(--status-danger)] mt-0.5 opacity-80">
                            Expira em: {timeRemaining(selected.expires_at)}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Payload */}
                    <div>
                      <h3 className="text-sm font-medium text-[var(--text-primary)] mb-2">
                        Dados para execução
                      </h3>
                      <pre className="text-xs bg-[var(--bg-tertiary)] border border-[var(--border-primary)] rounded-[var(--radius-md)] p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all text-[var(--text-secondary)] font-mono">
                        {JSON.stringify(selected.payload, null, 2)}
                      </pre>
                    </div>

                    {/* Ações — apenas para pendentes */}
                    {selected.status === "pending" && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                            Notas (opcional)
                          </label>
                          <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder="Justificativa ou motivo da rejeição..."
                            className="w-full border border-[var(--border-primary)] rounded-[var(--radius-md)] px-3 py-2 text-sm bg-[var(--bg-input)] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--border-focus)]/12 resize-none"
                          />
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDecision(selected.id, "approved")}
                            disabled={actionLoading}
                            className="flex-1 px-4 py-2 bg-[var(--status-success)] text-white text-sm font-semibold rounded-[var(--radius-sm)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                          >
                            {actionLoading ? "Processando..." : "Aprovar"}
                          </button>
                          <button
                            onClick={() => handleDecision(selected.id, "rejected")}
                            disabled={actionLoading}
                            className="flex-1 px-4 py-2 bg-[var(--status-danger)] text-white text-sm font-semibold rounded-[var(--radius-sm)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                          >
                            {actionLoading ? "Processando..." : "Rejeitar"}
                          </button>
                        </div>
                      </>
                    )}

                    {/* Resultado de decisões já tomadas */}
                    {selected.status !== "pending" && (
                      <div className={`p-3 rounded-[var(--radius-md)] border text-sm space-y-1 ${
                        selected.status === "approved"
                          ? "bg-[var(--status-success-bg)] border-[var(--status-success)] text-[var(--status-success)]"
                          : selected.status === "rejected"
                          ? "bg-[var(--status-danger-bg)] border-[var(--status-danger)] text-[var(--status-danger)]"
                          : "bg-[var(--bg-tertiary)] border-[var(--border-primary)] text-[var(--text-secondary)]"
                      }`}>
                        <p className="font-semibold">{STATUS_BADGE[selected.status].label}</p>
                        {selected.decided_at && (
                          <p className="text-xs opacity-75">{formatDateTime(selected.decided_at)}</p>
                        )}
                        {selected.admin_notes && (
                          <p className="text-xs">{selected.admin_notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
