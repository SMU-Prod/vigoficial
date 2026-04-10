"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton, SkeletonTable } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";

const AgentLiveMap = dynamic(() => import("@/components/dashboard/agent-live-map"), {
  ssr: false,
  loading: () => (
    <div className="rounded-xl p-8 flex items-center justify-center" style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-primary)", minHeight: 400 }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--ds-primary)", borderTopColor: "transparent" }} />
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Carregando mapa...</p>
      </div>
    </div>
  ),
});

// =============================================================================
// VIGI — Dashboard de Agentes IA
// Monitoramento em tempo real com controles de pause/resume
// =============================================================================

interface AgentDashboard {
  agent_name: string;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  avg_duration_ms: number;
  total_cost_usd: number;
  total_tokens: number;
}

interface SystemHealth {
  component: string;
  status: "healthy" | "degraded" | "down" | "paused";
  last_check: string;
  details: Record<string, unknown>;
  updated_at: string;
}

interface AgentRun {
  id: string;
  agent_name: string;
  trigger_type: string;
  status: "running" | "completed" | "failed" | "partial";
  company_id: string | null;
  duration_ms: number | null;
  total_tokens_used: number;
  total_cost_usd: number;
  started_at: string;
  completed_at: string | null;
  agent_decisions: { count: number }[];
}

interface AgentDecision {
  id: string;
  run_id: string;
  agent_name: string;
  decision_type: string;
  input_summary: string;
  output_summary: string;
  confidence: number | null;
  escalated_to_human: boolean;
  human_override: string | null;
  reasoning: string | null;
  created_at: string;
}

interface Costs24h {
  totalUsd: number;
  totalTokens: number;
  cacheHitRate: number;
}

interface AgentControlState {
  paused: boolean;
  pausedAt: string | null;
  pausedBy: string | null;
}

// ─── Helpers ───

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
  if (tokens === 0) return "0";
  if (tokens < 1000) return tokens.toString();
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1000000).toFixed(2)}M`;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.floor(hours / 24)}d atrás`;
}

const AGENT_LABELS: Record<string, { label: string; shortLabel: string }> = {
  captador: { label: "Captador", shortLabel: "CAP" },
  operacional: { label: "Operacional", shortLabel: "OPR" },
  comunicador: { label: "Comunicador", shortLabel: "COM" },
  orquestrador: { label: "Orquestrador", shortLabel: "ORQ" },
};

const STATUS_BADGE: Record<string, { label: string; variant: "green" | "yellow" | "red" | "blue" | "gray" }> = {
  running: { label: "Executando", variant: "blue" },
  completed: { label: "Concluído", variant: "green" },
  failed: { label: "Erro", variant: "red" },
  partial: { label: "Parcial", variant: "yellow" },
};

// ─── Inline Icons ───

function IconPause() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

// ─── Main ───

export default function AgentesPage() {
  const [dashboard, setDashboard] = useState<AgentDashboard[]>([]);
  const [health, setHealth] = useState<SystemHealth[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [escalations, setEscalations] = useState<AgentDecision[]>([]);
  const [costs, setCosts] = useState<Costs24h>({ totalUsd: 0, totalTokens: 0, cacheHitRate: 0 });
  const [decisions, setDecisions] = useState<AgentDecision[]>([]);
  const [agentStates, setAgentStates] = useState<Record<string, AgentControlState>>({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [controlLoading, setControlLoading] = useState<string | null>(null);

  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const fetchStatus = useCallback(async () => {
    try {
      setError("");
      const [statusRes, controlRes] = await Promise.all([
        fetch("/api/agents/status"),
        fetch("/api/agents/control"),
      ]);

      if (statusRes.ok) {
        const data = await statusRes.json();
        setDashboard(data.dashboard || []);
        setHealth(data.health || []);
        setRuns(data.recentRuns || []);
        setEscalations(data.escalations || []);
        setCosts(data.costs24h || { totalUsd: 0, totalTokens: 0, cacheHitRate: 0 });
      }

      if (controlRes.ok) {
        const data = await controlRes.json();
        setAgentStates(data.agents || {});
      }

      setLastRefresh(new Date());
    } catch {
      setError("Erro de conexão com o servidor");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDecisions = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filterAgent !== "all") params.set("agent", filterAgent);
      const res = await fetch(`/api/agents/decisions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDecisions(data.decisions || []);
      }
    } catch { /* optional tab */ }
  }, [filterAgent]);

  useEffect(() => { fetchStatus(); fetchDecisions(); }, [fetchStatus, fetchDecisions]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => { fetchStatus(); fetchDecisions(); }, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchStatus, fetchDecisions]);

  // ─── Agent control ───

  async function handleAgentControl(agent: string, action: "pause" | "resume") {
    setControlLoading(agent);
    try {
      const res = await fetch("/api/agents/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent, action }),
      });
      if (res.ok) {
        await fetchStatus();
      } else {
        const data = await res.json();
        alert(data.error || "Erro ao controlar agente");
      }
    } catch {
      alert("Erro de conexão");
    } finally {
      setControlLoading(null);
    }
  }

  async function handleOverride(decisionId: string) {
    const override = prompt("Descreva o override (decisão humana):");
    if (!override) return;
    try {
      const res = await fetch("/api/agents/decisions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId, humanOverride: override }),
      });
      if (res.ok) { await fetchStatus(); await fetchDecisions(); }
      else { const data = await res.json(); alert(data.error || "Erro"); }
    } catch { alert("Erro de conexão"); }
  }

  // ─── Loading ───

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton width="300px" height="32px" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-lg border p-6" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-primary)" }}>
              <Skeleton width="60%" height="20px" className="mb-3" />
              <Skeleton width="40%" height="28px" className="mb-2" />
              <Skeleton width="80%" height="16px" />
            </div>
          ))}
        </div>
        <SkeletonTable rows={5} columns={6} />
      </div>
    );
  }

  const filteredRuns = runs.filter((run) => {
    if (filterAgent !== "all" && run.agent_name !== filterAgent) return false;
    if (filterStatus !== "all" && run.status !== filterStatus) return false;
    return true;
  });

  const activeRuns = runs.filter((r) => r.status === "running");
  const pendingEscalations = escalations.filter((e) => !e.human_override);
  const allPaused = Object.values(agentStates).every((s) => s.paused);
  const anyPaused = Object.values(agentStates).some((s) => s.paused);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Agentes IA</h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>
            Monitoramento em tempo real dos 4 agentes autônomos
            {lastRefresh && <span className="ml-2">· Atualizado {timeAgo(lastRefresh.toISOString())}</span>}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {activeRuns.length > 0 && (
            <span className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full" style={{ background: "var(--status-info-bg)", color: "var(--status-info)" }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--status-info)" }} />
              {activeRuns.length} executando
            </span>
          )}
          {pendingEscalations.length > 0 && (
            <span className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full" style={{ background: "var(--status-danger-bg)", color: "var(--status-danger)" }}>
              {pendingEscalations.length} escalonamento{pendingEscalations.length > 1 ? "s" : ""}
            </span>
          )}

          {/* Global pause/resume */}
          <button
            onClick={() => handleAgentControl("all", allPaused ? "resume" : "pause")}
            disabled={controlLoading === "all"}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors"
            style={{
              borderColor: anyPaused ? "var(--status-warning)" : "var(--border-primary)",
              color: anyPaused ? "var(--status-warning)" : "var(--text-secondary)",
              background: anyPaused ? "var(--status-warning-bg)" : "var(--bg-secondary)",
            }}
          >
            {allPaused ? <IconPlay /> : <IconPause />}
            {allPaused ? "Retomar Todos" : "Pausar Todos"}
          </button>

          <button
            onClick={() => { fetchStatus(); fetchDecisions(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors"
            style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)", background: "var(--bg-secondary)" }}
          >
            <IconRefresh />
            Atualizar
          </button>

          <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
              style={{ borderColor: "var(--border-primary)" }}
            />
            Auto 15s
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-lg p-4" style={{ background: "var(--status-danger-bg)", border: "1px solid var(--status-danger)" }}>
          <p className="text-sm" style={{ color: "var(--status-danger)" }}>{error}</p>
        </div>
      )}

      {/* KPI Bar */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Custo 24h", value: formatCost(costs.totalUsd) },
          { label: "Tokens 24h", value: formatTokens(costs.totalTokens) },
          { label: "Cache Hit Rate", value: `${(costs.cacheHitRate * 100).toFixed(1)}%` },
          { label: "Runs Ativos", value: String(activeRuns.length), highlight: activeRuns.length > 0 },
          { label: "Saúde", custom: true },
        ].map((kpi, i) => (
          <div key={i} className="rounded-lg border p-4" style={{ background: "var(--bg-secondary)", borderColor: "var(--border-primary)" }}>
            <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{kpi.label}</p>
            {kpi.custom ? (
              <div className="flex gap-2 mt-2 flex-wrap">
                {health.length === 0 ? (
                  <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>Sem dados</span>
                ) : health.map((h) => (
                  <div key={h.component} className="flex items-center gap-1.5" title={`${h.component}: ${h.status}`}>
                    <span className="w-2 h-2 rounded-full" style={{
                      background: h.status === "healthy" ? "var(--status-success)" : h.status === "degraded" ? "var(--status-warning)" : "var(--status-danger)",
                    }} />
                    <span className="text-[11px] capitalize" style={{ color: "var(--text-secondary)" }}>{h.component}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xl font-semibold mt-1" style={{ color: kpi.highlight ? "var(--status-info)" : "var(--text-primary)" }}>
                {kpi.value}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Agent Cards with Pause/Resume Controls */}
      <div className="grid grid-cols-4 gap-3">
        {(["captador", "operacional", "comunicador", "orquestrador"] as const).map((name) => {
          const info = AGENT_LABELS[name];
          const stats = dashboard.find((d) => d.agent_name === name);
          const isRunning = activeRuns.some((r) => r.agent_name === name);
          const state = agentStates[name];
          const isPaused = state?.paused ?? false;

          return (
            <div
              key={name}
              className="rounded-lg border p-4 transition-all"
              style={{
                background: "var(--bg-secondary)",
                borderColor: isPaused ? "var(--status-warning)" : isRunning ? "var(--status-info)" : "var(--border-primary)",
                opacity: isPaused ? 0.75 : 1,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className="w-8 h-8 rounded-md flex items-center justify-center text-[11px] font-bold"
                    style={{ background: "var(--vigi-gold-muted)", color: "var(--vigi-gold)" }}
                  >
                    {info.shortLabel}
                  </span>
                  <h3 className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{info.label}</h3>
                </div>
                <div className="flex items-center gap-1.5">
                  {isRunning && !isPaused && (
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--status-info)" }} />
                  )}
                  <button
                    onClick={() => handleAgentControl(name, isPaused ? "resume" : "pause")}
                    disabled={controlLoading === name}
                    className="p-1 rounded transition-colors"
                    style={{ color: isPaused ? "var(--status-success)" : "var(--text-tertiary)" }}
                    title={isPaused ? "Retomar" : "Pausar"}
                  >
                    {isPaused ? <IconPlay /> : <IconPause />}
                  </button>
                </div>
              </div>

              {isPaused && (
                <div className="mb-3 text-[11px] px-2 py-1 rounded" style={{ background: "var(--status-warning-bg)", color: "var(--status-warning)" }}>
                  Pausado {state?.pausedAt ? timeAgo(state.pausedAt) : ""}
                </div>
              )}

              {stats ? (
                <div className="space-y-1.5">
                  {[
                    ["Runs (24h)", String(stats.total_runs)],
                    ["Sucesso", stats.total_runs > 0 ? `${Math.round((stats.successful_runs / stats.total_runs) * 100)}%` : "—"],
                    ["Duração média", formatDuration(stats.avg_duration_ms)],
                    ["Custo", formatCost(stats.total_cost_usd)],
                    ["Tokens", formatTokens(stats.total_tokens)],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between text-[13px]">
                      <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>{value}</span>
                    </div>
                  ))}
                  {stats.failed_runs > 0 && (
                    <div className="pt-1.5 mt-1.5" style={{ borderTop: "1px solid var(--border-secondary)" }}>
                      <span className="text-[12px] font-medium" style={{ color: "var(--status-danger)" }}>
                        {stats.failed_runs} falha{stats.failed_runs > 1 ? "s" : ""}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                  Nenhuma execução nas últimas 24h
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="live-map">
        <TabsList>
          <TabsTrigger value="live-map">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--status-success)" }} />
              Mapa ao Vivo
            </span>
          </TabsTrigger>
          <TabsTrigger value="runs">Execuções ({filteredRuns.length})</TabsTrigger>
          <TabsTrigger value="decisions">Decisões ({decisions.length})</TabsTrigger>
          <TabsTrigger value="escalations">Escalonamentos ({pendingEscalations.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="live-map">
          <AgentLiveMap />
        </TabsContent>

        <TabsContent value="runs">
          <div className="flex gap-3 mb-4">
            <select
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="text-sm rounded-md px-3 py-1.5"
              style={{ border: "1px solid var(--border-primary)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
            >
              <option value="all">Todos os agentes</option>
              {Object.entries(AGENT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-sm rounded-md px-3 py-1.5"
              style={{ border: "1px solid var(--border-primary)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
            >
              <option value="all">Todos os status</option>
              {Object.entries(STATUS_BADGE).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border-primary)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-primary)", background: "var(--bg-tertiary)" }}>
                  {["Agente", "Trigger", "Status", "Empresa", "Duração", "Tokens", "Custo", "Decisões", "Início"].map((h) => (
                    <th key={h} className="py-2.5 px-3 text-left text-[12px] font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRuns.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8" style={{ color: "var(--text-tertiary)" }}>Nenhuma execução encontrada</td></tr>
                ) : filteredRuns.map((run) => {
                  const agent = AGENT_LABELS[run.agent_name] || { label: run.agent_name, shortLabel: "?" };
                  const status = STATUS_BADGE[run.status] || { label: run.status, variant: "gray" as const };
                  const decisionCount = run.agent_decisions?.[0]?.count || 0;
                  return (
                    <tr key={run.id} className="transition-colors" style={{ borderBottom: "1px solid var(--border-secondary)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <td className="py-2.5 px-3">
                        <span className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--vigi-gold-muted)", color: "var(--vigi-gold)" }}>
                            {agent.shortLabel}
                          </span>
                          <span className="font-medium" style={{ color: "var(--text-primary)" }}>{agent.label}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>
                          {run.trigger_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3"><Badge variant={status.variant}>{status.label}</Badge></td>
                      <td className="py-2.5 px-3" style={{ color: "var(--text-secondary)" }}>{run.company_id ? run.company_id.slice(0, 8) + "…" : "—"}</td>
                      <td className="py-2.5 px-3 font-mono text-[12px]" style={{ color: "var(--text-secondary)" }}>{formatDuration(run.duration_ms)}</td>
                      <td className="py-2.5 px-3 font-mono text-[12px]" style={{ color: "var(--text-secondary)" }}>{formatTokens(run.total_tokens_used)}</td>
                      <td className="py-2.5 px-3 font-mono text-[12px]" style={{ color: "var(--text-secondary)" }}>{formatCost(run.total_cost_usd)}</td>
                      <td className="py-2.5 px-3 text-center">
                        {decisionCount > 0 ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--vigi-gold-muted)", color: "var(--vigi-gold)" }}>
                            {decisionCount}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-tertiary)" }}>0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[12px]" style={{ color: "var(--text-tertiary)" }}>{timeAgo(run.started_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="decisions">
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border-primary)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-primary)", background: "var(--bg-tertiary)" }}>
                  {["Agente", "Tipo", "Entrada", "Saída", "Confiança", "Escalado", "Quando"].map((h) => (
                    <th key={h} className="py-2.5 px-3 text-left text-[12px] font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {decisions.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8" style={{ color: "var(--text-tertiary)" }}>Nenhuma decisão registrada</td></tr>
                ) : decisions.map((d) => {
                  const agent = AGENT_LABELS[d.agent_name] || { label: d.agent_name, shortLabel: "?" };
                  return (
                    <tr key={d.id} style={{ borderBottom: "1px solid var(--border-secondary)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <td className="py-2.5 px-3">
                        <span className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--vigi-gold-muted)", color: "var(--vigi-gold)" }}>{agent.shortLabel}</span>
                          <span className="font-medium" style={{ color: "var(--text-primary)" }}>{agent.label}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-[11px] px-2 py-0.5 rounded" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>{d.decision_type}</span>
                      </td>
                      <td className="py-2.5 px-3 max-w-[200px] truncate" style={{ color: "var(--text-secondary)" }} title={d.input_summary}>{d.input_summary}</td>
                      <td className="py-2.5 px-3 max-w-[200px] truncate" style={{ color: "var(--text-secondary)" }} title={d.output_summary}>{d.output_summary}</td>
                      <td className="py-2.5 px-3">
                        {d.confidence !== null ? (
                          <span className="font-mono text-[12px] font-medium" style={{
                            color: d.confidence >= 0.7 ? "var(--status-success)" : d.confidence >= 0.5 ? "var(--status-warning)" : "var(--status-danger)",
                          }}>
                            {(d.confidence * 100).toFixed(0)}%
                          </span>
                        ) : <span style={{ color: "var(--text-tertiary)" }}>—</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        {d.escalated_to_human ? (
                          d.human_override ? <Badge variant="green">Resolvido</Badge> : <Badge variant="red">Pendente</Badge>
                        ) : <span style={{ color: "var(--text-tertiary)" }}>—</span>}
                      </td>
                      <td className="py-2.5 px-3 text-[12px]" style={{ color: "var(--text-tertiary)" }}>{timeAgo(d.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="escalations">
          {pendingEscalations.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-lg" style={{ color: "var(--text-tertiary)" }}>Nenhum escalonamento pendente</p>
              <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>
                Quando um agente precisar de aprovação humana, aparecerá aqui
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingEscalations.map((esc) => {
                const agent = AGENT_LABELS[esc.agent_name] || { label: esc.agent_name, shortLabel: "?" };
                return (
                  <div key={esc.id} className="rounded-lg p-4" style={{ background: "var(--status-danger-bg)", border: "1px solid var(--status-danger)" }}>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{agent.label}</span>
                          <Badge variant="red">Aguardando Humano</Badge>
                          <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>{timeAgo(esc.created_at)}</span>
                        </div>
                        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                          <span className="font-medium">Tipo:</span> {esc.decision_type}
                        </p>
                        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                          <span className="font-medium">Entrada:</span> {esc.input_summary}
                        </p>
                        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                          <span className="font-medium">Saída:</span> {esc.output_summary}
                        </p>
                        {esc.reasoning && (
                          <p className="text-sm italic mt-2" style={{ color: "var(--text-tertiary)" }}>
                            Razão: {esc.reasoning}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleOverride(esc.id)}
                        className="ml-4 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap"
                        style={{ background: "var(--vigi-gold)", color: "var(--vigi-navy)" }}
                      >
                        Decidir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
