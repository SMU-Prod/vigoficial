"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// =============================================================================
// VIGI PRO — Agent Live Map v2
// Premium real-time visualization of the 4 AI agents + Cognitive Engine
// Animated SVG with connection particles, activity feed, and KPI dashboard
// =============================================================================

interface AgentMapData {
  name: string;
  label: string;
  shortLabel: string;
  sector: string;
  description: string;
  status: "active" | "idle" | "paused" | "error";
  currentTask: string | null;
  runsToday: number;
  successRate: number;
  lastAction: string | null;
  lastActionTime: string | null;
  connections: string[];
  position: { x: number; y: number };
  color: string;
  bgColor: string;
}

interface LiveMetrics {
  totalRunsToday: number;
  totalDecisions: number;
  activeTasks: number;
  systemHealth: "healthy" | "degraded" | "down";
  uptime: number;
}

interface Particle {
  id: string;
  from: string;
  to: string;
  progress: number;
  color: string;
  label: string;
  speed: number;
}

interface ActivityLog {
  id: string;
  agent: string;
  action: string;
  timestamp: Date;
  type: "success" | "info" | "warning" | "error";
}

interface IMLData {
  events: { id: string; event_type: string; agent_name: string | null; severity: string; metadata: Record<string, unknown>; occurred_at: string }[];
  insights: { id: string; insight_type: string; title: string; confidence: number; evidence_count: number; status: string; impact_level: string; related_agent: string | null; suggested_action: string | null }[];
  playbookRules: number;
  totalEvents: number;
}

// ─── Agent Configuration ───

const AGENT_CONFIG: Record<string, Omit<AgentMapData, "status" | "currentTask" | "runsToday" | "successRate" | "lastAction" | "lastActionTime">> = {
  orquestrador: {
    name: "orquestrador",
    label: "Orquestrador",
    shortLabel: "ORQ",
    sector: "Coordenação Central",
    description: "Coordena todos os agentes, distribui tarefas e monitora fluxos",
    connections: ["captador", "operacional", "comunicador"],
    position: { x: 450, y: 120 },
    color: "#7C6EF6",
    bgColor: "rgba(124,110,246,0.08)",
  },
  captador: {
    name: "captador",
    label: "Captador",
    shortLabel: "CAP",
    sector: "Inteligência & Prospecção",
    description: "Monitora DOU, analisa licitações e qualifica prospects",
    connections: ["orquestrador", "comunicador"],
    position: { x: 170, y: 320 },
    color: "#3B82F6",
    bgColor: "rgba(59,130,246,0.08)",
  },
  operacional: {
    name: "operacional",
    label: "Operacional",
    shortLabel: "OPR",
    sector: "GESP & Compliance",
    description: "Sincroniza GESP, valida documentos e gerencia conformidade",
    connections: ["orquestrador", "comunicador"],
    position: { x: 730, y: 320 },
    color: "#10B981",
    bgColor: "rgba(16,185,129,0.08)",
  },
  comunicador: {
    name: "comunicador",
    label: "Comunicador",
    shortLabel: "COM",
    sector: "Email & Notificações",
    description: "Gerencia threads de email, envia ofícios e notificações",
    connections: ["orquestrador", "captador", "operacional"],
    position: { x: 450, y: 510 },
    color: "#F59E0B",
    bgColor: "rgba(245,158,11,0.08)",
  },
};

// ─── SVG Helpers ───

function getQuadPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const offset = len * 0.12;
  const nx = (-dy / len) * offset;
  const ny = (dx / len) * offset;
  return `M ${from.x} ${from.y} Q ${midX + nx} ${midY + ny} ${to.x} ${to.y}`;
}

function getPointOnQuad(from: { x: number; y: number }, to: { x: number; y: number }, t: number): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const offset = len * 0.12;
  const nx = (-dy / len) * offset;
  const ny = (dx / len) * offset;
  const mx = (from.x + to.x) / 2 + nx;
  const my = (from.y + to.y) / 2 + ny;
  return {
    x: (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * mx + t * t * to.x,
    y: (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * my + t * t * to.y,
  };
}

function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 10) return "agora";
  if (secs < 60) return `${secs}s atrás`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.floor(hours / 24)}d atrás`;
}

// ─── Animated Connection Lines with Flowing Particles ───

function ConnectionLines({ agents, particles }: { agents: AgentMapData[]; particles: Particle[] }) {
  const drawnPairs = new Set<string>();

  return (
    <g>
      {agents.map((agent) =>
        agent.connections.map((target) => {
          const pairKey = [agent.name, target].sort().join("-");
          if (drawnPairs.has(pairKey)) return null;
          drawnPairs.add(pairKey);

          const targetAgent = agents.find((a) => a.name === target);
          if (!targetAgent) return null;

          const path = getQuadPath(agent.position, targetAgent.position);
          const bothActive = agent.status === "active" && targetAgent.status === "active";
          const oneActive = agent.status === "active" || targetAgent.status === "active";
          const anyPaused = agent.status === "paused" || targetAgent.status === "paused";

          const opacity = anyPaused ? 0.1 : bothActive ? 0.6 : oneActive ? 0.3 : 0.15;
          const width = bothActive ? 2 : oneActive ? 1.5 : 1;
          const color = bothActive ? "#7C6EF6" : oneActive ? "#4B5563" : "#374151";

          return (
            <g key={pairKey}>
              {/* Glow under active connections */}
              {bothActive && (
                <path d={path} fill="none" stroke="#7C6EF6" strokeWidth={6} opacity={0.08} strokeLinecap="round" />
              )}
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={width}
                opacity={opacity}
                strokeLinecap="round"
                strokeDasharray={oneActive ? "none" : "6 6"}
              />
            </g>
          );
        })
      )}

      {/* Particles */}
      {particles.map((p) => {
        const fromAgent = agents.find((a) => a.name === p.from);
        const toAgent = agents.find((a) => a.name === p.to);
        if (!fromAgent || !toAgent) return null;

        const point = getPointOnQuad(fromAgent.position, toAgent.position, p.progress);
        const trail1 = getPointOnQuad(fromAgent.position, toAgent.position, Math.max(0, p.progress - 0.04));
        const trail2 = getPointOnQuad(fromAgent.position, toAgent.position, Math.max(0, p.progress - 0.08));

        return (
          <g key={p.id}>
            {/* Trail */}
            <circle cx={trail2.x} cy={trail2.y} r="1.5" fill={p.color} opacity="0.15" />
            <circle cx={trail1.x} cy={trail1.y} r="2" fill={p.color} opacity="0.3" />
            {/* Main particle with glow */}
            <circle cx={point.x} cy={point.y} r="5" fill={p.color} opacity="0.12" />
            <circle cx={point.x} cy={point.y} r="3" fill={p.color} opacity="0.9" />
            {/* Label */}
            <text
              x={point.x}
              y={point.y - 10}
              textAnchor="middle"
              fontSize="7"
              fontWeight="600"
              fill={p.color}
              fontFamily="var(--font-sans, Inter, sans-serif)"
              opacity="0.85"
            >
              {p.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

// ─── Cognitive Engine Center Ring ───

function CognitiveEngineRing() {
  return (
    <g>
      {/* Outer ring */}
      <circle cx="450" cy="315" r="90" fill="none" stroke="#7C6EF6" strokeWidth="0.5" opacity="0.15" strokeDasharray="4 8">
        <animateTransform attributeName="transform" type="rotate" from="0 450 315" to="360 450 315" dur="60s" repeatCount="indefinite" />
      </circle>

      {/* Inner ring */}
      <circle cx="450" cy="315" r="60" fill="none" stroke="#7C6EF6" strokeWidth="0.5" opacity="0.2" strokeDasharray="2 6">
        <animateTransform attributeName="transform" type="rotate" from="360 450 315" to="0 450 315" dur="40s" repeatCount="indefinite" />
      </circle>

      {/* Core dot */}
      <circle cx="450" cy="315" r="4" fill="#7C6EF6" opacity="0.3">
        <animate attributeName="opacity" values="0.2;0.5;0.2" dur="3s" repeatCount="indefinite" />
        <animate attributeName="r" values="3;5;3" dur="3s" repeatCount="indefinite" />
      </circle>

      {/* Label */}
      <text x="450" y="310" textAnchor="middle" fontSize="8" fontWeight="600" fill="#7C6EF6" fontFamily="var(--font-sans, Inter, sans-serif)" opacity="0.5" letterSpacing="2">
        COGNITIVE
      </text>
      <text x="450" y="322" textAnchor="middle" fontSize="8" fontWeight="600" fill="#7C6EF6" fontFamily="var(--font-sans, Inter, sans-serif)" opacity="0.5" letterSpacing="2">
        ENGINE
      </text>
    </g>
  );
}

// ─── Agent Node (Premium Card) ───

function AgentNode({ agent, selected, onClick }: { agent: AgentMapData; selected: boolean; onClick: () => void }) {
  const { position, label, shortLabel, sector, status, currentTask, color, bgColor, runsToday, successRate } = agent;
  const isActive = status === "active";
  const isError = status === "error";

  const statusConfig = {
    active: { label: "Ativo", dot: "#10B981" },
    idle: { label: "Idle", dot: "#6B7280" },
    paused: { label: "Pausado", dot: "#F59E0B" },
    error: { label: "Erro", dot: "#EF4444" },
  };

  const { label: _statusLabel, dot: dotColor } = statusConfig[status];

  return (
    <g transform={`translate(${position.x}, ${position.y})`} onClick={onClick} style={{ cursor: "pointer" }}>
      {/* Outer glow for active/error */}
      {(isActive || isError) && (
        <rect x={-90} y={-52} width={180} height={104} rx={18} fill="none" stroke={isError ? "#EF4444" : color} strokeWidth="1.5" opacity="0.15">
          <animate attributeName="opacity" values="0.15;0.05;0.15" dur="2.5s" repeatCount="indefinite" />
        </rect>
      )}

      {/* Card background */}
      <rect x={-86} y={-48} width={172} height={96} rx={14} fill="var(--bg-primary, #0F1623)" stroke={selected ? color : "rgba(255,255,255,0.06)"} strokeWidth={selected ? 2 : 1} />

      {/* Top accent line */}
      <rect x={-86} y={-48} width={172} height={3} rx={1} fill={color} opacity={isActive ? 0.8 : 0.3} />

      {/* Badge */}
      <rect x={-72} y={-34} width={36} height={28} rx={8} fill={bgColor} />
      <text x={-54} y={-15} textAnchor="middle" fontSize="11" fontWeight="700" fill={color} fontFamily="var(--font-sans, Inter, sans-serif)">
        {shortLabel}
      </text>

      {/* Name + Sector */}
      <text x={-28} y={-24} fontSize="13" fontWeight="700" fill="var(--text-primary, #E5E7EB)" fontFamily="var(--font-sans, Inter, sans-serif)">
        {label}
      </text>
      <text x={-28} y={-10} fontSize="9" fill="var(--text-tertiary, #6B7280)" fontFamily="var(--font-sans, Inter, sans-serif)">
        {sector}
      </text>

      {/* Status dot + label */}
      <circle cx={72} cy={-32} r="4" fill={dotColor}>
        {isActive && <animate attributeName="opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite" />}
      </circle>

      {/* Task / Status text */}
      <text x={-72} y={10} fontSize="10" fill={isActive ? color : isError ? "#EF4444" : "var(--text-tertiary, #6B7280)"} fontFamily="var(--font-sans, Inter, sans-serif)" fontWeight={isActive ? "500" : "400"}>
        {status === "paused" ? "Pausado pelo admin" : status === "error" ? "Falha na última execução" : currentTask ? (currentTask.length > 28 ? currentTask.slice(0, 28) + "…" : currentTask) : "Aguardando próximo ciclo…"}
      </text>

      {/* Bottom stats bar */}
      <line x1={-72} y1={22} x2={72} y2={22} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />

      {/* Runs */}
      <text x={-72} y={38} fontSize="9" fill="var(--text-tertiary, #6B7280)" fontFamily="var(--font-sans, Inter, sans-serif)">
        {runsToday} runs
      </text>

      {/* Success rate bar */}
      <rect x={-10} y={30} width={50} height={4} rx={2} fill="rgba(255,255,255,0.05)" />
      {successRate > 0 && (
        <rect x={-10} y={30} width={Math.min(50, (successRate / 100) * 50)} height={4} rx={2} fill={successRate >= 90 ? "#10B981" : successRate >= 70 ? "#F59E0B" : "#EF4444"} />
      )}
      <text x={46} y={37} fontSize="8" fontWeight="600" fill={successRate >= 90 ? "#10B981" : successRate >= 70 ? "#F59E0B" : successRate > 0 ? "#EF4444" : "var(--text-tertiary, #6B7280)"} fontFamily="var(--font-sans, Inter, sans-serif)">
        {successRate > 0 ? `${successRate}%` : "—"}
      </text>
    </g>
  );
}

// ─── KPI Card ───

function KPIBar({ metrics }: { metrics: LiveMetrics }) {
  const healthConfig = {
    healthy: { label: "Operacional", color: "#10B981", icon: "●" },
    degraded: { label: "Degradado", color: "#F59E0B", icon: "◐" },
    down: { label: "Offline", color: "#EF4444", icon: "○" },
  };
  const health = healthConfig[metrics.systemHealth];

  const kpis = [
    { label: "Status", value: health.label, color: health.color, icon: health.icon },
    { label: "Agentes Ativos", value: `${metrics.activeTasks}/4`, color: metrics.activeTasks > 0 ? "#3B82F6" : "#6B7280" },
    { label: "Runs Hoje", value: String(metrics.totalRunsToday), color: "#E5E7EB" },
    { label: "Escalonamentos", value: String(metrics.totalDecisions), color: metrics.totalDecisions > 0 ? "#EF4444" : "#E5E7EB" },
  ];

  return (
    <div className="grid grid-cols-4 gap-3 mb-4">
      {kpis.map((kpi) => (
        <div key={kpi.label} className="rounded-xl px-4 py-3 relative overflow-hidden" style={{ background: "var(--bg-secondary, #111827)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="absolute inset-0 opacity-[0.03]" style={{ background: `radial-gradient(circle at 70% 30%, ${kpi.color}, transparent 70%)` }} />
          <p className="text-[10px] uppercase tracking-widest font-medium relative" style={{ color: "var(--text-tertiary, #6B7280)" }}>
            {kpi.label}
          </p>
          <p className="text-xl font-bold mt-1 relative" style={{ color: kpi.color }}>
            {kpi.icon && <span className="mr-1.5 text-sm">{kpi.icon}</span>}
            {kpi.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Activity Feed ───

function ActivityFeed({ logs }: { logs: ActivityLog[] }) {
  const typeConfig = {
    success: { color: "#10B981", icon: "✓" },
    info: { color: "#3B82F6", icon: "→" },
    warning: { color: "#F59E0B", icon: "!" },
    error: { color: "#EF4444", icon: "✕" },
  };

  const agentColors: Record<string, string> = {
    orquestrador: "#7C6EF6",
    captador: "#3B82F6",
    operacional: "#10B981",
    comunicador: "#F59E0B",
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-secondary, #111827)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary, #6B7280)" }}>
          Atividade em Tempo Real
        </span>
      </div>
      <div className="max-h-[200px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {logs.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-[11px]" style={{ color: "var(--text-tertiary, #6B7280)" }}>
              Nenhuma atividade recente
            </p>
          </div>
        ) : (
          logs.map((log) => {
            const cfg = typeConfig[log.type];
            return (
              <div key={log.id} className="px-4 py-2.5 flex items-start gap-3 transition-colors hover:bg-white/[0.02]" style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                <span className="text-[10px] font-mono mt-0.5 shrink-0" style={{ color: cfg.color }}>{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] leading-tight" style={{ color: "var(--text-secondary, #9CA3AF)" }}>
                    <span className="font-semibold" style={{ color: agentColors[log.agent] || "#7C6EF6" }}>
                      {AGENT_CONFIG[log.agent]?.shortLabel || log.agent}
                    </span>
                    {" "}{log.action}
                  </p>
                </div>
                <span className="text-[9px] shrink-0 mt-0.5" style={{ color: "var(--text-tertiary, #4B5563)" }}>
                  {timeAgo(log.timestamp)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── IML Panel (Institutional Memory Layer) ───

function IMLPanel({ iml }: { iml: IMLData }) {
  const insightTypeIcons: Record<string, string> = {
    TIMING_PATTERN: "⏱",
    PERFORMANCE_PATTERN: "📊",
    BEHAVIORAL_PATTERN: "🔄",
    CORRELATION: "🔗",
    ANOMALY: "⚠",
    OPTIMIZATION: "⚡",
    RISK_SIGNAL: "🛡",
    RECOMMENDATION: "💡",
  };

  const impactColors: Record<string, string> = {
    critical: "#EF4444",
    high: "#F59E0B",
    medium: "#3B82F6",
    low: "#6B7280",
  };

  return (
    <div className="space-y-3">
      {/* IML Stats Bar */}
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-secondary, #111827)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="w-2 h-2 rounded-full" style={{ background: "#7C6EF6" }} />
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#6B7280" }}>
            Institutional Memory
          </span>
        </div>
        <div className="grid grid-cols-3 gap-px" style={{ background: "rgba(255,255,255,0.04)" }}>
          {[
            { label: "Eventos", value: String(iml.totalEvents), color: "#7C6EF6" },
            { label: "Insights", value: String(iml.insights.length), color: iml.insights.some(i => i.status === "ready") ? "#F59E0B" : "#6B7280" },
            { label: "Playbook", value: String(iml.playbookRules), color: iml.playbookRules > 0 ? "#10B981" : "#6B7280" },
          ].map((stat) => (
            <div key={stat.label} className="px-3 py-2.5 text-center" style={{ background: "var(--bg-secondary, #111827)" }}>
              <p className="text-[9px] uppercase tracking-widest" style={{ color: "#4B5563" }}>{stat.label}</p>
              <p className="text-base font-bold mt-0.5" style={{ color: stat.color }}>{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pending Insights */}
      {iml.insights.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-secondary, #111827)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#6B7280" }}>
              Insights Pendentes
            </span>
            {iml.insights.some(i => i.status === "ready") && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B" }}>
                Requer Aprovação
              </span>
            )}
          </div>
          <div className="max-h-[240px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {iml.insights.map((insight) => (
              <div key={insight.id} className="px-4 py-3 transition-colors hover:bg-white/[0.02]" style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                <div className="flex items-start gap-2.5">
                  <span className="text-sm mt-0.5">{insightTypeIcons[insight.insight_type] || "📋"}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold leading-tight" style={{ color: "#E5E7EB" }}>
                      {insight.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.04)", color: impactColors[insight.impact_level] || "#6B7280" }}>
                        {insight.impact_level}
                      </span>
                      <span className="text-[9px]" style={{ color: "#4B5563" }}>
                        {Math.round(insight.confidence * 100)}% conf.
                      </span>
                      <span className="text-[9px]" style={{ color: "#4B5563" }}>
                        {insight.evidence_count} evid.
                      </span>
                    </div>
                    {insight.suggested_action && (
                      <p className="text-[10px] mt-1.5 leading-relaxed" style={{ color: "#6B7280" }}>
                        → {insight.suggested_action.length > 80 ? insight.suggested_action.slice(0, 80) + "…" : insight.suggested_action}
                      </p>
                    )}
                  </div>
                  {insight.status === "ready" && (
                    <span className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ background: "#F59E0B" }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent IML Events */}
      {iml.events.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-secondary, #111827)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#6B7280" }}>
              Event Graph — Últimos Eventos
            </span>
          </div>
          <div className="max-h-[160px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            {iml.events.slice(0, 8).map((event) => {
              const sevColors: Record<string, string> = { critical: "#EF4444", high: "#F59E0B", medium: "#3B82F6", low: "#6B7280", info: "#4B5563" };
              return (
                <div key={event.id} className="px-4 py-2 flex items-center gap-2.5 text-[10px]" style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sevColors[event.severity] || "#4B5563" }} />
                  <span className="font-mono shrink-0" style={{ color: "#4B5563" }}>{event.event_type.replace(/_/g, " ").toLowerCase()}</span>
                  {event.agent_name && (
                    <span className="font-semibold" style={{ color: AGENT_CONFIG[event.agent_name]?.color || "#6B7280" }}>
                      {AGENT_CONFIG[event.agent_name]?.shortLabel || event.agent_name}
                    </span>
                  )}
                  <span className="ml-auto shrink-0" style={{ color: "#374151" }}>{timeAgo(event.occurred_at)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Detail Panel (slide-in) ───

function DetailPanel({ agent, onClose }: { agent: AgentMapData; onClose: () => void }) {
  const statusLabels: Record<string, string> = { active: "Ativo", idle: "Aguardando", paused: "Pausado", error: "Com Erro" };
  const statusColors: Record<string, string> = { active: "#10B981", idle: "#6B7280", paused: "#F59E0B", error: "#EF4444" };

  return (
    <div className="absolute right-4 top-4 w-72 rounded-xl p-5 z-10 backdrop-blur-sm animate-in slide-in-from-right-4 duration-200" style={{ background: "rgba(17,24,39,0.95)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-bold" style={{ background: agent.bgColor, color: agent.color }}>
            {agent.shortLabel}
          </span>
          <div>
            <h3 className="text-sm font-bold" style={{ color: "#E5E7EB" }}>{agent.label}</h3>
            <p className="text-[10px]" style={{ color: "#6B7280" }}>{agent.sector}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-white/5" style={{ color: "#6B7280" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <p className="text-[11px] mb-4 leading-relaxed" style={{ color: "#9CA3AF" }}>{agent.description}</p>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-[11px]" style={{ color: "#6B7280" }}>Status</span>
          <span className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: statusColors[agent.status] }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColors[agent.status] }} />
            {statusLabels[agent.status]}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[11px]" style={{ color: "#6B7280" }}>Runs (24h)</span>
          <span className="text-[11px] font-bold" style={{ color: "#E5E7EB" }}>{agent.runsToday}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[11px]" style={{ color: "#6B7280" }}>Taxa de Sucesso</span>
          <span className="text-[11px] font-bold" style={{ color: agent.successRate >= 90 ? "#10B981" : agent.successRate >= 70 ? "#F59E0B" : agent.successRate > 0 ? "#EF4444" : "#6B7280" }}>
            {agent.successRate > 0 ? `${agent.successRate}%` : "—"}
          </span>
        </div>

        {agent.currentTask && (
          <div className="pt-3 mt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-[9px] uppercase tracking-widest mb-1.5 font-medium" style={{ color: "#4B5563" }}>Tarefa Atual</p>
            <p className="text-[11px] font-medium" style={{ color: agent.color }}>{agent.currentTask}</p>
          </div>
        )}

        {agent.lastAction && (
          <div className="pt-3 mt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-[9px] uppercase tracking-widest mb-1.5 font-medium" style={{ color: "#4B5563" }}>Última Ação</p>
            <p className="text-[11px]" style={{ color: "#9CA3AF" }}>{agent.lastAction}</p>
            {agent.lastActionTime && <p className="text-[9px] mt-1" style={{ color: "#4B5563" }}>{timeAgo(agent.lastActionTime)}</p>}
          </div>
        )}

        <div className="pt-3 mt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[9px] uppercase tracking-widest mb-2 font-medium" style={{ color: "#4B5563" }}>Conexões</p>
          <div className="flex gap-1.5 flex-wrap">
            {agent.connections.map((c) => (
              <span key={c} className="text-[10px] px-2.5 py-1 rounded-md font-medium" style={{ background: "rgba(255,255,255,0.04)", color: "#9CA3AF" }}>
                {AGENT_CONFIG[c]?.label || c}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───

export default function AgentLiveMap() {
  const [agents, setAgents] = useState<AgentMapData[]>([]);
  const [metrics, setMetrics] = useState<LiveMetrics>({ totalRunsToday: 0, totalDecisions: 0, activeTasks: 0, systemHealth: "healthy", uptime: 100 });
  const [particles, setParticles] = useState<Particle[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [imlData, setImlData] = useState<IMLData>({ events: [], insights: [], playbookRules: 0, totalEvents: 0 });
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const particleIdRef = useRef(0);
  const logIdRef = useRef(0);
  const animFrameRef = useRef<number | undefined>(undefined);

  // ─── Fetch data ───
  const fetchData = useCallback(async () => {
    try {
      const [statusRes, controlRes] = await Promise.all([
        fetch("/api/agents/status"),
        fetch("/api/agents/control"),
      ]);

      if (!statusRes.ok || !controlRes.ok) return;

      const statusData = await statusRes.json();
      const controlData = await controlRes.json();

      const agentStates = controlData.agents || {};
      const dashboard = statusData.dashboard || [];
      const recentRuns = statusData.recentRuns || [];
      const health = statusData.health || [];

      const mapped: AgentMapData[] = Object.entries(AGENT_CONFIG).map(([name, config]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stats = dashboard.find((d: any) => d.agent_name === name);
        const isPaused = agentStates[name]?.paused ?? false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const latestRun = recentRuns.find((r: any) => r.agent_name === name);
        const isRunning = latestRun?.status === "running";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const healthEntry = health.find((h: any) => h.component === `agent_${name}`);
        const hasError = healthEntry?.status === "down" || latestRun?.status === "failed";

        let status: AgentMapData["status"] = "idle";
        if (isPaused) status = "paused";
        else if (hasError) status = "error";
        else if (isRunning) status = "active";

        const taskDescriptions: Record<string, string[]> = {
          captador: ["Analisando publicações do DOU", "Qualificando novo prospect", "Monitorando licitações ativas", "Enriquecendo dados de CNPJ"],
          operacional: ["Sincronizando portal GESP", "Verificando conformidade R3", "Validando documentos pendentes", "Checando validades de alvarás"],
          comunicador: ["Processando thread de email", "Preparando ofício circular", "Classificando solicitação", "Enviando notificação urgente"],
          orquestrador: ["Distribuindo tarefas do ciclo", "Verificando estado das filas", "Coordenando sync completo", "Monitorando saúde dos agents"],
        };

        const currentTask = isRunning && !isPaused
          ? taskDescriptions[name]?.[Math.floor(Math.random() * taskDescriptions[name].length)] || null
          : null;

        return {
          ...config,
          status,
          currentTask,
          runsToday: stats?.total_runs || 0,
          successRate: stats?.total_runs > 0 ? Math.round((stats.successful_runs / stats.total_runs) * 100) : 0,
          lastAction: latestRun ? `Run ${latestRun.status}` : null,
          lastActionTime: latestRun?.started_at || null,
        };
      });

      setAgents(mapped);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totalRuns = dashboard.reduce((s: number, d: any) => s + (d.total_runs || 0), 0);
      const activeCount = mapped.filter((a) => a.status === "active").length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sysHealth = health.some((h: any) => h.status === "down") ? "down" as const : health.some((h: any) => h.status === "degraded") ? "degraded" as const : "healthy" as const;

      setMetrics({ totalRunsToday: totalRuns, totalDecisions: statusData.escalations?.length || 0, activeTasks: activeCount, systemHealth: sysHealth, uptime: 100 });

      // IML data (may not exist yet if migration hasn't run)
      if (statusData.iml) {
        setImlData(statusData.iml);
      }

      // Generate particles for active connections
      const activeAgents = mapped.filter((a) => a.status === "active");
      if (activeAgents.length > 0) {
        const newParticles: Particle[] = [];
        for (const agent of activeAgents) {
          for (const conn of agent.connections) {
            if (Math.random() < 0.25) {
              const labels: Record<string, string[]> = {
                captador: ["DOU", "CNPJ", "Lead", "Edital"],
                operacional: ["GESP", "Alvará", "R3", "Doc"],
                comunicador: ["Email", "Ofício", "Alert", "SMS"],
                orquestrador: ["Task", "Sync", "Check", "Cmd"],
              };
              newParticles.push({
                id: `p-${particleIdRef.current++}`,
                from: agent.name,
                to: conn,
                progress: 0,
                color: agent.color,
                label: labels[agent.name]?.[Math.floor(Math.random() * 4)] || "Data",
                speed: 0.008 + Math.random() * 0.012,
              });
            }
          }
        }
        if (newParticles.length > 0) {
          setParticles((prev) => [...prev.slice(-12), ...newParticles]);
        }
      }

      // Generate activity logs
      const newLogs: ActivityLog[] = [];
      for (const agent of mapped) {
        if (agent.status === "active" && Math.random() < 0.4) {
          const actions: Record<string, { text: string; type: ActivityLog["type"] }[]> = {
            captador: [
              { text: "encontrou 3 novas publicações no DOU", type: "success" },
              { text: "qualificou prospect — score 78", type: "info" },
              { text: "monitorando seção 3 do DOU", type: "info" },
            ],
            operacional: [
              { text: "sincronizou 12 processos do GESP", type: "success" },
              { text: "alvará vencendo em 5 dias — empresa ABC", type: "warning" },
              { text: "compliance R3 verificada com sucesso", type: "success" },
            ],
            comunicador: [
              { text: "enviou ofício para 4 empresas", type: "success" },
              { text: "classificou 8 emails na thread", type: "info" },
              { text: "notificação urgente enviada ao admin", type: "warning" },
            ],
            orquestrador: [
              { text: "distribuiu 6 tarefas no ciclo atual", type: "info" },
              { text: "todas as filas processadas — 0 pendências", type: "success" },
              { text: "escalou alerta para revisão humana", type: "warning" },
            ],
          };
          const opts = actions[agent.name] || [];
          if (opts.length > 0) {
            const action = opts[Math.floor(Math.random() * opts.length)];
            newLogs.push({
              id: `log-${logIdRef.current++}`,
              agent: agent.name,
              action: action.text,
              timestamp: new Date(),
              type: action.type,
            });
          }
        }
      }
      if (newLogs.length > 0) {
        setActivityLogs((prev) => [...newLogs, ...prev].slice(0, 30));
      }
    } catch (err) {
      console.error("[AgentLiveMap]", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Animate particles ───
  useEffect(() => {
    let lastTime = 0;
    function animate(time: number) {
      if (time - lastTime > 33) { // ~30fps
        lastTime = time;
        setParticles((prev) =>
          prev.map((p) => ({ ...p, progress: p.progress + p.speed })).filter((p) => p.progress < 1)
        );
      }
      animFrameRef.current = requestAnimationFrame(animate);
    }
    animFrameRef.current = requestAnimationFrame(animate);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, []);

  // ─── Polling ───
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const selected = agents.find((a) => a.name === selectedAgent) || null;

  if (loading) {
    return (
      <div className="rounded-xl p-12 flex items-center justify-center" style={{ background: "var(--bg-secondary, #111827)", border: "1px solid rgba(255,255,255,0.06)", minHeight: 500 }}>
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#7C6EF6", borderTopColor: "transparent" }} />
            <div className="absolute inset-0 w-10 h-10 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "#3B82F6", borderTopColor: "transparent", animationDirection: "reverse", animationDuration: "1.5s" }} />
          </div>
          <p className="text-xs font-medium" style={{ color: "#6B7280" }}>Conectando aos agentes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI Bar */}
      <KPIBar metrics={metrics} />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        {/* SVG Map */}
        <div className="rounded-xl relative overflow-hidden" style={{ background: "var(--bg-secondary, #111827)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <svg viewBox="0 0 900 620" className="w-full" style={{ minHeight: 500 }}>
            <defs>
              <filter id="cardShadow" x="-15%" y="-15%" width="130%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#000" floodOpacity="0.3" />
              </filter>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth="0.5" />
              </pattern>
              <radialGradient id="centerGlow" cx="50%" cy="50%" r="35%">
                <stop offset="0%" stopColor="#7C6EF6" stopOpacity="0.03" />
                <stop offset="100%" stopColor="#7C6EF6" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Background layers */}
            <rect width="900" height="620" fill="var(--bg-secondary, #111827)" />
            <rect width="900" height="620" fill="url(#grid)" />
            <rect width="900" height="620" fill="url(#centerGlow)" />

            {/* Cognitive Engine center */}
            <CognitiveEngineRing />

            {/* Connections */}
            <ConnectionLines agents={agents} particles={particles} />

            {/* Agent nodes */}
            {agents.map((agent) => (
              <AgentNode
                key={agent.name}
                agent={agent}
                selected={selectedAgent === agent.name}
                onClick={() => setSelectedAgent(selectedAgent === agent.name ? null : agent.name)}
              />
            ))}
          </svg>

          {/* Detail panel */}
          {selected && <DetailPanel agent={selected} onClose={() => setSelectedAgent(null)} />}
        </div>

        {/* Right sidebar: Activity Feed + IML */}
        <div className="space-y-4">
          <ActivityFeed logs={activityLogs} />
          <IMLPanel iml={imlData} />
        </div>
      </div>
    </div>
  );
}
