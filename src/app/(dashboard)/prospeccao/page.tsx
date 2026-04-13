"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { DataTable } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Pagination } from "@/components/ui/pagination";
import { SearchInput } from "@/components/ui/search-input";
import { useToast } from "@/components/ui/toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { formatBrl } from "@/lib/utils";
import { formatCNPJ } from "@/lib/formatters";
import { useDebounce } from "@/hooks/useDebounce";
import type { Prospect, LeadStatus, LeadTemperatura } from "@/types/database";

interface ProspectActivity {
  id: string;
  tipo: string;
  descricao: string;
  resultado?: string;
  created_at: string;
}

// ============================================================================
// CRM Configuration — Inspired by Pipedrive / HubSpot / Salesforce
// ============================================================================

const PIPELINE_STAGES: { key: LeadStatus; label: string; emoji: string; color: string; bg: string; border: string; accent: string; probability: number }[] = [
  { key: "novo", label: "Novos", emoji: "📥", color: "text-[var(--text-secondary)]", bg: "bg-[var(--bg-tertiary)]", border: "border-[var(--border-primary)]", accent: "bg-[var(--text-tertiary)]", probability: 5 },
  { key: "contatado", label: "Contatados", emoji: "📞", color: "text-[var(--vigi-navy)]", bg: "bg-[var(--bg-secondary)]", border: "border-[var(--border-primary)]", accent: "bg-[var(--vigi-navy-light)]", probability: 15 },
  { key: "qualificado", label: "Qualificados", emoji: "✅", color: "text-[var(--vigi-navy)]", bg: "bg-[var(--bg-secondary)]", border: "border-[var(--border-primary)]", accent: "bg-[var(--vigi-navy)]", probability: 30 },
  { key: "proposta_enviada", label: "Proposta", emoji: "📄", color: "text-[var(--vigi-navy)]", bg: "bg-[var(--bg-secondary)]", border: "border-[var(--border-primary)]", accent: "bg-[var(--vigi-gold)]", probability: 50 },
  { key: "negociacao", label: "Negociação", emoji: "🤝", color: "text-[var(--vigi-navy)]", bg: "bg-[var(--bg-secondary)]", border: "border-[var(--border-primary)]", accent: "bg-[var(--vigi-gold)]", probability: 75 },
  { key: "ganho", label: "Ganhos", emoji: "🏆", color: "text-[var(--status-success)]", bg: "bg-[var(--bg-secondary)]", border: "border-[var(--border-primary)]", accent: "bg-[var(--status-success)]", probability: 100 },
  { key: "perdido", label: "Perdidos", emoji: "❌", color: "text-[var(--text-tertiary)]", bg: "bg-[var(--bg-secondary)]", border: "border-[var(--border-primary)]", accent: "bg-[var(--status-danger)]", probability: 0 },
];

const STATUS_MAP = Object.fromEntries(PIPELINE_STAGES.map(s => [s.key, s]));
const ACTIVE_STAGES = PIPELINE_STAGES.filter(s => s.key !== "perdido" && s.key !== "ganho");
const NEXT_STATUS: Partial<Record<LeadStatus, LeadStatus>> = {
  novo: "contatado", contatado: "qualificado", qualificado: "proposta_enviada",
  proposta_enviada: "negociacao", negociacao: "ganho",
};

const TEMP_CONFIG: Record<LeadTemperatura, { label: string; color: string; dot: string; bg: string }> = {
  frio: { label: "Frio", color: "text-[var(--status-info)]", dot: "bg-[var(--status-info)]", bg: "bg-[var(--status-info-bg)]" },
  morno: { label: "Morno", color: "text-[var(--status-warning)]", dot: "bg-[var(--status-warning)]", bg: "bg-[var(--status-warning-bg)]" },
  quente: { label: "Quente", color: "text-[var(--status-danger)]", dot: "bg-[var(--status-danger)]", bg: "bg-[var(--status-danger-bg)]" },
};

const UFS = "AC,AL,AM,AP,BA,CE,DF,ES,GO,MA,MG,MS,MT,PA,PB,PE,PI,PR,RJ,RN,RO,RR,RS,SC,SE,SP,TO".split(",").map(u => ({ value: u, label: u }));
const PLANOS = [
  { value: "essencial", label: "Essencial — R$ 1.500" },
  { value: "profissional", label: "Profissional — R$ 3.000" },
  { value: "enterprise", label: "Enterprise — R$ 6.000" },
  { value: "custom", label: "Custom — Negociado" },
];
const PLANO_VALORES: Record<string, number> = { essencial: 1500, profissional: 3000, enterprise: 6000, custom: 0 };
const ACTIVITY_TYPES = [
  { value: "ligacao", label: "📞 Ligação" },
  { value: "email", label: "📧 Email" },
  { value: "reuniao", label: "📅 Reunião" },
  { value: "whatsapp", label: "💬 WhatsApp" },
  { value: "nota", label: "📝 Nota" },
  { value: "proposta", label: "📑 Proposta" },
  { value: "followup", label: "🔄 Follow-up" },
];

// Deal rotting: dias sem contato para considerar "esfriando"
const ROTTING_DAYS = { warning: 7, danger: 14 };

interface Stats {
  total: number;
  por_status: Record<string, number>;
  por_temperatura: Record<string, number>;
  com_email: number;
  com_telefone: number;
  valor_pipeline: number;
  followups_pendentes: number;
  dou_total?: number;
  dou_com_alvara?: number;
  por_source?: Record<string, number>;
}

type ViewMode = "table" | "kanban" | "analytics";

// ============================================================================
// Utility functions
// ============================================================================

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function getRottingStatus(prospect: Prospect): "ok" | "warning" | "danger" | null {
  if (prospect.status === "ganho" || prospect.status === "perdido") return null;
  const days = daysSince(prospect.ultimo_contato || prospect.created_at);
  if (days === null) return null;
  if (days >= ROTTING_DAYS.danger) return "danger";
  if (days >= ROTTING_DAYS.warning) return "warning";
  return "ok";
}

function getWeightedValue(prospect: Prospect): number {
  if (!prospect.valor_estimado) return 0;
  const stage = STATUS_MAP[prospect.status];
  return (prospect.valor_estimado * (stage?.probability || 0)) / 100;
}

// ============================================================================
// Memoized ProspectCard Component
// ============================================================================

const ProspectCard = React.memo(function ProspectCard({
  prospect,
  onSelect,
  onDragStart,
  onDragEnd
}: {
  prospect: Prospect;
  onSelect: (p: Prospect) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
}) {
  const rotting = getRottingStatus(prospect);
  const daysAgo = daysSince(prospect.ultimo_contato || prospect.created_at);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, prospect.id)}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(prospect)}
      className={`bg-[var(--bg-secondary)] rounded-[var(--radius-md)] p-3 shadow-[var(--shadow-sm)] border cursor-grab active:cursor-grabbing hover:shadow-[var(--shadow-md)] transition-all ${
        rotting === "danger" ? "border-[var(--status-danger)] border-l-4 border-l-[var(--status-danger)]" :
        rotting === "warning" ? "border-[var(--status-warning)] border-l-4 border-l-[var(--status-warning)]" :
        "border-[var(--border-primary)] hover:border-[var(--vigi-gold)]/30"
      }`}
    >
      {/* Deal rotting indicator */}
      {rotting === "danger" && (
        <div className="text-[9px] text-[var(--status-danger)] font-semibold mb-1 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-danger)] animate-pulse" />
          Esfriando — {daysAgo}d sem contato
        </div>
      )}
      {rotting === "warning" && (
        <div className="text-[9px] text-[var(--status-warning)] font-medium mb-1">
          ⚠ {daysAgo}d sem contato
        </div>
      )}

      <div className="flex items-center gap-1">
        <p className="text-xs font-semibold text-[var(--vigi-navy)] leading-tight line-clamp-2 flex-1">
          {prospect.nome_fantasia || prospect.razao_social}
        </p>
        {prospect.source === "dou" && (
          <span className="shrink-0 text-[8px] px-1 py-0.5 rounded-[var(--radius-xs)] bg-[var(--status-info-bg)] text-[var(--status-info)] font-bold">DOU</span>
        )}
      </div>
      <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{prospect.municipio && `${prospect.municipio}/`}{prospect.uf}</p>

      <div className="flex items-center justify-between mt-2">
        <ScoreBadge score={prospect.score} small />
        <TempDot temp={prospect.temperatura} />
      </div>

      {prospect.valor_estimado && (
        <div className="flex justify-between mt-1.5">
          <span className="text-[10px] font-bold text-[var(--vigi-gold)]">{formatBrl(prospect.valor_estimado)}/mês</span>
          <span className="text-[9px] text-[var(--text-tertiary)]">{formatBrl(getWeightedValue(prospect))} pond.</span>
        </div>
      )}

      {prospect.contato_nome && (
        <p className="text-[10px] text-[var(--text-secondary)] mt-1 truncate">👤 {prospect.contato_nome}</p>
      )}

      {prospect.proximo_followup && (
        <p className={`text-[9px] mt-1 font-medium ${
          new Date(prospect.proximo_followup) < new Date() ? "text-[var(--status-danger)]" : "text-[var(--status-info)]"
        }`}>
          📅 Follow-up: {new Date(prospect.proximo_followup).toLocaleDateString("pt-BR")}
        </p>
      )}
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export default function ProspeccaoPage() {
  const toast = useToast();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterTemp, setFilterTemp] = useState("");
  const [filterUf, setFilterUf] = useState("");
  const [filterSource, setFilterSource] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [kanbanPage, setKanbanPage] = useState(1);
  const kanbanPageSize = 200; // Kanban loads in pages of 200 for performance
  const [kanbanHasMore, setKanbanHasMore] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Modals
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerProspect, setDrawerProspect] = useState<(Prospect & { activities?: ProspectActivity[] }) | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [quickFollowupOpen, setQuickFollowupOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);

  // Drag & Drop
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // ============================================================================
  // Data Fetching
  // ============================================================================

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    // Create new abort controller
    abortControllerRef.current = new AbortController();

    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (filterStatus) params.set("status", filterStatus);
      if (filterTemp) params.set("temperatura", filterTemp);
      if (filterUf) params.set("uf", filterUf);
      if (filterSource) params.set("source", filterSource);
      if (viewMode === "table") {
        params.set("limit", pageSize.toString());
        params.set("offset", ((currentPage - 1) * pageSize).toString());
      } else {
        // Kanban/Analytics: paginated loading (200 per page, accumulative)
        params.set("limit", kanbanPageSize.toString());
        params.set("offset", ((kanbanPage - 1) * kanbanPageSize).toString());
      }
      const res = await fetch(`/api/prospects?${params}`, {
        signal: abortControllerRef.current.signal,
      });
      if (res.ok) {
        const json = await res.json();
        if (viewMode !== "table" && kanbanPage > 1) {
          // Append to existing prospects for kanban "load more"
          setProspects(prev => [...prev, ...(json.data || [])]);
        } else {
          setProspects(json.data || []);
        }
        setTotalCount(json.count || 0);
        setKanbanHasMore((json.data || []).length === kanbanPageSize && kanbanPage * kanbanPageSize < (json.count || 0));
      }
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        /* silent */
      }
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, filterStatus, filterTemp, filterUf, filterSource, currentPage, pageSize, viewMode, kanbanPage]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/prospects/stats");
      if (res.ok) setStats(await res.json());
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchProspects(); }, [fetchProspects]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ============================================================================
  // Actions
  // ============================================================================

  async function openDrawer(prospect: Prospect) {
    setDrawerLoading(true);
    setDrawerOpen(true);
    setDrawerProspect(null);
    try {
      const res = await fetch(`/api/prospects/${prospect.id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Erro ${res.status}` }));
        toast.error(err.error || `Erro ao carregar prospect (${res.status})`);
        setDrawerOpen(false);
        return;
      }
      const data = await res.json();
      setDrawerProspect(data);
    } catch {
      toast.error("Erro de conexão ao carregar prospect");
      setDrawerOpen(false);
    } finally {
      setDrawerLoading(false);
    }
  }

  async function handleAdvance(id: string, novoStatus: LeadStatus) {
    try {
      const res = await fetch(`/api/prospects/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novoStatus }),
      });
      if (res.ok) {
        toast.success(`→ ${STATUS_MAP[novoStatus]?.label}`);
        fetchProspects(); fetchStats();
        if (drawerProspect?.id === id) setDrawerProspect(prev => prev ? { ...prev, status: novoStatus } : null);
      }
    } catch { toast.error("Erro"); }
  }

  async function handleConvert(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!drawerProspect) return;
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const plano = form.get("plano") as string;
    const valor = plano === "custom" ? parseFloat(form.get("valor_mensal") as string) || 0 : PLANO_VALORES[plano];
    try {
      const res = await fetch(`/api/prospects/${drawerProspect.id}/convert`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plano, valor_mensal: valor }),
      });
      if (res.ok) { toast.success("Convertido em cliente!"); setConvertOpen(false); setDrawerOpen(false); fetchProspects(); fetchStats(); }
      else { const d = await res.json(); toast.error(d.error || "Erro"); }
    } catch { toast.error("Erro"); } finally { setSaving(false); }
  }

  async function handleAddActivity(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!drawerProspect) return;
    setSaving(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/prospects/${drawerProspect.id}/activities`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_id: drawerProspect.id, tipo: form.get("tipo"), descricao: form.get("descricao"), resultado: form.get("resultado") || null }),
      });
      if (res.ok) { toast.success("Atividade registrada"); setActivityOpen(false); openDrawer(drawerProspect); }
    } catch { toast.error("Erro"); } finally { setSaving(false); }
  }

  async function handleEditSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!drawerProspect) return;
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {};
    for (const f of ["contato_nome","contato_cargo","contato_email","contato_telefone","temperatura","notas","proximo_followup","plano_interesse","valor_estimado"]) {
      const v = form.get(f);
      if (v !== null && v !== "") body[f] = f === "valor_estimado" ? parseFloat(v as string) || null : v;
    }
    try {
      const res = await fetch(`/api/prospects/${drawerProspect.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (res.ok) { toast.success("Atualizado"); setEditOpen(false); openDrawer(drawerProspect); fetchProspects(); }
    } catch { toast.error("Erro"); } finally { setSaving(false); }
  }

  async function handleQuickFollowup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!drawerProspect) return;
    setSaving(true);
    const form = new FormData(e.currentTarget);
    const date = form.get("data") as string;
    const nota = form.get("nota") as string;
    try {
      // Atualiza follow-up date
      await fetch(`/api/prospects/${drawerProspect.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proximo_followup: date }),
      });
      // Registra atividade
      if (nota) {
        await fetch(`/api/prospects/${drawerProspect.id}/activities`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prospect_id: drawerProspect.id, tipo: "followup", descricao: `Follow-up agendado para ${date}. ${nota}` }),
        });
      }
      toast.success(`Follow-up agendado para ${date}`);
      setQuickFollowupOpen(false);
      openDrawer(drawerProspect);
    } catch { toast.error("Erro"); } finally { setSaving(false); }
  }

  async function handleEnrich() {
    if (!drawerProspect) return;
    setEnriching(true);
    try {
      const res = await fetch(`/api/prospects/${drawerProspect.id}/enrich`, {
        method: "POST", headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setDrawerProspect(data);
        toast.success("Dados enriquecidos com sucesso!");
        fetchProspects();
      } else {
        const err = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        toast.error(err.error || "Erro ao enriquecer dados");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setEnriching(false);
    }
  }

  // Drag & Drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    (e.target as HTMLElement).style.opacity = "0.5";
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = "1";
    setDraggedId(null);
    setDragOverStage(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, stageKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStage(stageKey);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverStage(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetStage: LeadStatus) => {
    e.preventDefault();
    setDragOverStage(null);
    if (!draggedId) return;
    const prospect = prospects.find(p => p.id === draggedId);
    if (!prospect || prospect.status === targetStage) return;

    // Optimistic update
    setProspects(prev => prev.map(p => p.id === draggedId ? { ...p, status: targetStage } : p));

    try {
      const res = await fetch(`/api/prospects/${draggedId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStage }),
      });
      if (res.ok) {
        toast.success(`${prospect.nome_fantasia || prospect.razao_social} → ${STATUS_MAP[targetStage]?.label}`);
        fetchStats();
      } else {
        // Revert
        setProspects(prev => prev.map(p => p.id === draggedId ? { ...p, status: prospect.status } : p));
        toast.error("Erro ao mover");
      }
    } catch {
      setProspects(prev => prev.map(p => p.id === draggedId ? { ...p, status: prospect.status } : p));
    }
    setDraggedId(null);
  }, [draggedId, prospects, toast, fetchStats]);

  // ============================================================================
  // Analytics calculations
  // ============================================================================

  const analyticsData = (() => {
    if (!prospects.length) return null;

    const ganhos = prospects.filter(p => p.status === "ganho");
    const perdidos = prospects.filter(p => p.status === "perdido");
    const ativos = prospects.filter(p => !["ganho", "perdido"].includes(p.status));
    const winRate = ganhos.length + perdidos.length > 0
      ? Math.round((ganhos.length / (ganhos.length + perdidos.length)) * 100) : 0;

    // Weighted pipeline
    const weightedTotal = ativos.reduce((sum, p) => sum + getWeightedValue(p), 0);

    // Deals rotting
    const rotting = ativos.filter(p => getRottingStatus(p) === "danger").length;
    const warning = ativos.filter(p => getRottingStatus(p) === "warning").length;

    // Conversion funnel
    const funnel = PIPELINE_STAGES.filter(s => s.key !== "perdido").map(stage => ({
      ...stage,
      count: prospects.filter(p => p.status === stage.key).length,
      value: prospects.filter(p => p.status === stage.key).reduce((s, p) => s + (p.valor_estimado || 0), 0),
      weighted: prospects.filter(p => p.status === stage.key).reduce((s, p) => s + getWeightedValue(p), 0),
    }));

    // Top UFs
    const ufCounts: Record<string, number> = {};
    ativos.forEach(p => { if (p.uf) ufCounts[p.uf] = (ufCounts[p.uf] || 0) + 1; });
    const topUfs = Object.entries(ufCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);

    return { ganhos: ganhos.length, perdidos: perdidos.length, ativos: ativos.length, winRate, weightedTotal, rotting, warning, funnel, topUfs };
  })();

  // ============================================================================
  // RENDER
  // ============================================================================

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="min-h-screen">
      {/* ================================================================ */}
      {/* HEADER */}
      {/* ================================================================ */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-[var(--vigi-navy)]">Prospecção</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Pipeline comercial — {totalCount.toLocaleString("pt-BR")} leads
            {viewMode !== "table" && prospects.length < totalCount && (
              <span className="text-[var(--text-tertiary)]"> ({prospects.length.toLocaleString("pt-BR")} carregados)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-[var(--radius-md)] flex p-0.5 shadow-[var(--shadow-sm)]">
            {(["kanban", "table", "analytics"] as ViewMode[]).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] transition-all ${viewMode === mode ? "bg-[var(--btn-primary)] text-white shadow" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
              >
                {mode === "kanban" ? "Pipeline" : mode === "table" ? "Lista" : "Analytics"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* KPI STRIP — Forecasting & Weighted Pipeline */}
      {/* ================================================================ */}
      {stats && (
        <div className="space-y-2 mb-4">
          {/* Linha 1: Pipeline Comercial */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            <Kpi label="Total" value={stats.total.toLocaleString("pt-BR")} sub={`${stats.com_email.toLocaleString("pt-BR")} c/ email`} />
            <Kpi label="Pipeline Ativo" value={String((stats.por_status.contatado || 0) + (stats.por_status.qualificado || 0) + (stats.por_status.proposta_enviada || 0) + (stats.por_status.negociacao || 0))} accent />
            <Kpi label="Negociação" value={String(stats.por_status.negociacao || 0)} sub="prontos p/ fechar" accent />
            <Kpi label="Ganhos" value={String(stats.por_status.ganho || 0)} color="text-[var(--status-success)]" />
            <Kpi label="Win Rate" value={analyticsData ? `${analyticsData.winRate}%` : "—"} color={analyticsData && analyticsData.winRate >= 20 ? "text-[var(--status-success)]" : "text-[var(--status-warning)]"} />
            <Kpi label="MRR Ponderado" value={analyticsData ? formatBrl(analyticsData.weightedTotal) : "—"} accent sub="weighted forecast" />
            <Kpi label="Esfriando" value={analyticsData ? String(analyticsData.rotting) : "0"} color={analyticsData && analyticsData.rotting > 0 ? "text-[var(--status-danger)]" : "text-[var(--status-success)]"} sub={`${analyticsData?.warning || 0} em alerta`} />
            <Kpi label="Follow-ups" value={String(stats.followups_pendentes)} color={stats.followups_pendentes > 0 ? "text-[var(--status-danger)]" : "text-[var(--status-success)]"} sub={stats.followups_pendentes > 0 ? "pendentes!" : "em dia"} />
          </div>
          {/* Linha 2: DOU & Sources */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            <Kpi label="Via DOU" value={String(stats.dou_total || 0)} sub="auto-cadastrados" color="text-[var(--status-info)]" />
            <Kpi label="DOU c/ Alvara" value={String(stats.dou_com_alvara || 0)} sub="vinculados" color="text-[var(--vigi-gold)]" />
            <Kpi label="Via CSV" value={String(stats.por_source?.csv_rfb || 0)} sub="importados RFB" />
            <Kpi label="Outbound" value={String(stats.por_source?.outbound || 0)} sub="prospecção ativa" />
            <Kpi label="Website" value={String(stats.por_source?.website || 0)} sub="inbound" />
            <Kpi label="c/ Telefone" value={stats.com_telefone.toLocaleString("pt-BR")} sub={`${((stats.com_telefone / Math.max(stats.total, 1)) * 100).toFixed(0)}% do total`} />
            <Kpi label="Perdidos" value={String(stats.por_status.perdido || 0)} color="text-[var(--status-danger)]" />
            <Kpi label="Valor Pipeline" value={formatBrl(stats.valor_pipeline)} accent sub="total estimado" />
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* FILTERS */}
      {/* ================================================================ */}
      <div className="bg-[var(--bg-secondary)] rounded-[var(--radius-md)] border border-[var(--border-primary)] p-3 mb-4 shadow-[var(--shadow-sm)]">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <SearchInput placeholder="Buscar empresa, CNPJ, cidade..."
            onSearch={(val) => { setSearch(val); setCurrentPage(1); setKanbanPage(1); }} />
          <Select id="fs" name="fs" label="" placeholder="Status"
            options={[{ value: "", label: "Todos os status" }, ...PIPELINE_STAGES.map(s => ({ value: s.key, label: `${s.emoji} ${s.label}` }))]}
            value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); setKanbanPage(1); }} />
          <Select id="ft" name="ft" label="" placeholder="Temperatura"
            options={[{ value: "", label: "Temperatura" }, ...Object.entries(TEMP_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))]}
            value={filterTemp} onChange={(e) => { setFilterTemp(e.target.value); setCurrentPage(1); setKanbanPage(1); }} />
          <Select id="fso" name="fso" label="" placeholder="Origem"
            options={[
              { value: "", label: "Todas as origens" },
              { value: "dou", label: "📰 DOU (auto-raspagem)" },
              { value: "csv_rfb", label: "📁 CSV (importado RFB)" },
              { value: "outbound", label: "📤 Outbound" },
              { value: "website", label: "🌐 Website (inbound)" },
              { value: "evento", label: "🎫 Evento" },
              { value: "outro", label: "📋 Outro" },
            ]}
            value={filterSource} onChange={(e) => { setFilterSource(e.target.value); setCurrentPage(1); setKanbanPage(1); }} />
          <Select id="fu" name="fu" label="" placeholder="UF"
            options={[{ value: "", label: "Todos" }, ...UFS]}
            value={filterUf} onChange={(e) => { setFilterUf(e.target.value); setCurrentPage(1); setKanbanPage(1); }} />
        </div>
      </div>

      {/* ================================================================ */}
      {/* VIEW: KANBAN (Pipedrive-style with Drag & Drop) */}
      {/* ================================================================ */}
      {viewMode === "kanban" && (
        <>
          {prospects.length === 0 && !loading ? (
            <EmptyState
              icon="🔍"
              title="Nenhum prospect encontrado"
              description="Tente ajustar os filtros ou adicione um novo prospect."
              actionLabel="Novo Prospect"
              onAction={() => setDrawerOpen(true)}
            />
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "65vh" }}>
          {ACTIVE_STAGES.map(stage => {
            const stageItems = prospects.filter(p => p.status === stage.key);
            const stageValue = stageItems.reduce((s, p) => s + (p.valor_estimado || 0), 0);
            const isDragOver = dragOverStage === stage.key;

            return (
              <div key={stage.key}
                className={`flex-shrink-0 w-[270px] rounded-[var(--radius-lg)] border transition-all flex flex-col overflow-hidden ${isDragOver ? "border-[var(--vigi-gold)] bg-[var(--vigi-gold-muted)]/30 scale-[1.01]" : `${stage.border} ${stage.bg}`}`}
                onDragOver={(e) => handleDragOver(e, stage.key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, stage.key)}
              >
                {/* Accent bar */}
                <div className={`h-1 w-full ${stage.accent}`} />
                {/* Column Header */}
                <div className="p-3 border-b border-[var(--border-primary)]">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-sm font-semibold ${stage.color}`}>{stage.emoji} {stage.label}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full text-[var(--text-secondary)] bg-[var(--bg-tertiary)]">{stageItems.length}</span>
                  </div>
                  {stageValue > 0 && (
                    <p className="text-[10px] text-[var(--text-secondary)]">{formatBrl(stageValue)} total · {formatBrl(stageValue * stage.probability / 100)} ponderado</p>
                  )}
                </div>

                {/* Cards */}
                <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[60vh]">
                  {stageItems.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-xs text-[var(--text-tertiary)] italic">Arraste leads aqui</p>
                    </div>
                  )}
                  {stageItems.slice(0, 80).map(p => (
                    <ProspectCard
                      key={p.id}
                      prospect={p}
                      onSelect={openDrawer}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Ganhos column (collapsed) */}
          <div className="flex-shrink-0 w-[180px] rounded-[var(--radius-lg)] border-2 border-[var(--status-success)] bg-[var(--status-success-bg)] flex flex-col">

            <div className="p-3 border-b border-[var(--status-success)]">
              <span className="text-sm font-bold text-[var(--status-success)]">🏆 Ganhos</span>
              <span className="ml-2 text-xs font-bold text-[var(--status-success)]">{prospects.filter(p => p.status === "ganho").length}</span>
            </div>
            <div className="flex-1 p-2 space-y-1 overflow-y-auto max-h-[60vh]"
              onDragOver={(e) => handleDragOver(e, "ganho")}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, "ganho")}
            >
              {prospects.filter(p => p.status === "ganho").slice(0, 20).map(p => (
                <div key={p.id} onClick={() => openDrawer(p)}
                  className="bg-[var(--bg-secondary)]/80 rounded-[var(--radius-sm)] p-2 text-[10px] text-[var(--status-success)] font-medium cursor-pointer hover:bg-[var(--bg-secondary)] truncate">
                  {p.nome_fantasia || p.razao_social}
                </div>
              ))}
            </div>
          </div>
            </div>
          )}
        </>
      )}

      {/* Kanban/Analytics pagination — load more + counter */}
      {viewMode !== "table" && (
        <div className="flex items-center justify-between mt-3 px-1">
          <p className="text-xs text-[var(--text-secondary)]">
            Exibindo {prospects.length.toLocaleString("pt-BR")} de {totalCount.toLocaleString("pt-BR")} leads
          </p>
          {kanbanHasMore && (
            <button
              onClick={() => setKanbanPage(p => p + 1)}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium rounded-[var(--radius-md)] bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)] disabled:opacity-50 transition-all"
            >
              {loading ? "Carregando..." : `Carregar mais ${kanbanPageSize} leads`}
            </button>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* VIEW: TABLE */}
      {/* ================================================================ */}
      {viewMode === "table" && (
        <>
          <DataTable
            columns={[
              { key: "empresa", header: "Empresa", render: (p: Prospect) => (
                <div className="min-w-[180px]">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-[var(--vigi-navy)] text-sm leading-tight">{p.razao_social}</p>
                    {p.source === "dou" && <span className="shrink-0 text-[8px] px-1.5 py-0.5 rounded-[var(--radius-xs)] bg-[var(--status-info-bg)] text-[var(--status-info)] font-bold border border-[var(--status-info)]">DOU</span>}
                  </div>
                  <p className="text-[10px] text-[var(--text-tertiary)]">{formatCNPJ(p.cnpj)} · {p.municipio}/{p.uf}</p>
                  {getRottingStatus(p) === "danger" && <span className="text-[9px] text-[var(--status-danger)] font-semibold">🔴 Esfriando</span>}
                </div>
              )},
              { key: "contato", header: "Contato", render: (p: Prospect) => (
                <div className="text-xs max-w-[180px]">
                  {p.contato_nome && <p className="font-medium text-[var(--vigi-navy)]">{p.contato_nome}</p>}
                  {(p.contato_email || p.email) && <p className="text-[var(--status-info)] truncate">{p.contato_email || p.email}</p>}
                  {(p.contato_telefone || p.telefone1) && <p className="text-[var(--text-secondary)]">{p.contato_telefone || p.telefone1}</p>}
                </div>
              )},
              { key: "source", header: "Origem", render: (p: Prospect) => {
                const srcMap: Record<string, { label: string; cls: string }> = {
                  dou: { label: "DOU", cls: "bg-[var(--status-info-bg)] text-[var(--status-info)] border-[var(--status-info)]" },
                  csv_rfb: { label: "CSV", cls: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-primary)]" },
                  outbound: { label: "Outbound", cls: "bg-[var(--status-info-bg)] text-[var(--status-info)] border-[var(--status-info)]" },
                  website: { label: "Inbound", cls: "bg-[var(--status-success-bg)] text-[var(--status-success)] border-[var(--status-success)]" },
                  evento: { label: "Evento", cls: "bg-[var(--status-info-bg)] text-[var(--status-info)] border-[var(--status-info)]" },
                  outro: { label: "Outro", cls: "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-primary)]" },
                };
                const src = srcMap[p.source] || srcMap.outro;
                return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${src.cls}`}>{src.label}</span>;
              }},
              { key: "score", header: "Score", render: (p: Prospect) => <ScoreBadge score={p.score} /> },
              { key: "temp", header: "Temp", render: (p: Prospect) => <TempDot temp={p.temperatura} /> },
              { key: "status", header: "Pipeline", render: (p: Prospect) => {
                const s = STATUS_MAP[p.status];
                return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${s?.bg} ${s?.color} border ${s?.border}`}>{s?.emoji} {s?.label}</span>;
              }},
              { key: "valor", header: "MRR Est.", render: (p: Prospect) => (
                <div className="text-xs">
                  <p className="font-medium">{p.valor_estimado ? formatBrl(p.valor_estimado) : "—"}</p>
                  {p.valor_estimado && <p className="text-[9px] text-[var(--text-tertiary)]">{formatBrl(getWeightedValue(p))} pond.</p>}
                </div>
              )},
              { key: "followup", header: "Follow-up", render: (p: Prospect) => {
                if (!p.proximo_followup) return <span className="text-[10px] text-[var(--text-tertiary)]">—</span>;
                const overdue = new Date(p.proximo_followup) < new Date();
                return <span className={`text-[10px] font-medium ${overdue ? "text-[var(--status-danger)]" : "text-[var(--status-info)]"}`}>
                  {new Date(p.proximo_followup).toLocaleDateString("pt-BR")}
                </span>;
              }},
              { key: "acoes", header: "", render: (p: Prospect) => {
                const next = NEXT_STATUS[p.status];
                return next ? (
                  <button onClick={(e) => { e.stopPropagation(); handleAdvance(p.id, next); }}
                    className="text-[10px] px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--btn-primary)] text-white hover:bg-[var(--btn-primary-hover)]">
                    → {STATUS_MAP[next]?.label}
                  </button>
                ) : null;
              }},
            ]}
            data={prospects} loading={loading} onRowClick={openDrawer}
            emptyMessage="Nenhum lead encontrado."
          />
          {!loading && totalCount > 0 && (
            <div className="mt-4">
              <Pagination currentPage={currentPage} totalPages={totalPages} totalCount={totalCount}
                pageSize={pageSize} onPageChange={setCurrentPage}
                onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }} />
            </div>
          )}
        </>
      )}

      {/* ================================================================ */}
      {/* VIEW: ANALYTICS */}
      {/* ================================================================ */}
      {viewMode === "analytics" && analyticsData && (
        <div className="space-y-5">
          {/* Conversion Funnel */}
          <div className="bg-[var(--bg-secondary)] rounded-[var(--radius-lg)] border border-[var(--border-primary)] shadow-[var(--shadow-sm)] p-5">
            <h3 className="text-sm font-bold text-[var(--vigi-navy)] mb-4">Funil de Conversão (Weighted Pipeline)</h3>
            <div className="space-y-2">
              {analyticsData.funnel.map((stage) => {
                const maxCount = Math.max(...analyticsData.funnel.map(f => f.count), 1);
                const pct = (stage.count / maxCount) * 100;
                return (
                  <div key={stage.key} className="flex items-center gap-3">
                    <div className="w-28 text-xs font-medium text-[var(--text-secondary)] text-right">{stage.emoji} {stage.label}</div>
                    <div className="flex-1 h-8 bg-[var(--bg-tertiary)] rounded-[var(--radius-md)] overflow-hidden relative">
                      <div className={`h-full rounded-[var(--radius-md)] transition-all ${stage.bg} border ${stage.border}`}
                        style={{ width: `${Math.max(pct, 2)}%` }} />
                      <div className="absolute inset-0 flex items-center px-3">
                        <span className={`text-xs font-bold ${stage.color}`}>{stage.count} leads</span>
                        <span className="text-[10px] text-[var(--text-secondary)] ml-auto">
                          {formatBrl(stage.value)} total · {formatBrl(stage.weighted)} ponderado ({stage.probability}%)
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricBox title="Win Rate" value={`${analyticsData.winRate}%`}
              subtitle={`${analyticsData.ganhos} ganhos de ${analyticsData.ganhos + analyticsData.perdidos} decididos`}
              color={analyticsData.winRate >= 20 ? "green" : "amber"} />
            <MetricBox title="Pipeline Ativo" value={String(analyticsData.ativos)}
              subtitle={`${analyticsData.rotting} esfriando, ${analyticsData.warning} em alerta`}
              color={analyticsData.rotting > 10 ? "red" : "blue"} />
            <MetricBox title="MRR Ponderado" value={formatBrl(analyticsData.weightedTotal)}
              subtitle="Forecast baseado em probabilidade por estágio"
              color="gold" />
            <MetricBox title="Perdidos" value={String(analyticsData.perdidos)}
              subtitle={`de ${stats?.total || 0} total`}
              color="red" />
          </div>

          {/* Top UFs */}
          <div className="bg-[var(--bg-secondary)] rounded-[var(--radius-lg)] border border-[var(--border-primary)] shadow-[var(--shadow-sm)] p-5">
            <h3 className="text-sm font-bold text-[var(--vigi-navy)] mb-3">Distribuição por UF (Pipeline Ativo)</h3>
            <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
              {analyticsData.topUfs.map(([uf, count]) => (
                <div key={uf} className="text-center bg-[var(--bg-tertiary)] rounded-[var(--radius-md)] p-2">
                  <p className="text-lg font-bold text-[var(--vigi-navy)]">{uf}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{count}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Stage Probability Legend */}
          <div className="bg-[var(--bg-secondary)] rounded-[var(--radius-lg)] border border-[var(--border-primary)] shadow-[var(--shadow-sm)] p-5">
            <h3 className="text-sm font-bold text-[var(--vigi-navy)] mb-3">Probabilidade por Estágio (Weighted Pipeline)</h3>
            <div className="flex flex-wrap gap-3">
              {PIPELINE_STAGES.filter(s => s.key !== "perdido").map(s => (
                <div key={s.key} className={`flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] ${s.bg} border ${s.border}`}>
                  <span className={`text-xs font-medium ${s.color}`}>{s.emoji} {s.label}</span>
                  <span className={`text-xs font-bold ${s.color}`}>{s.probability}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* DRAWER — Lead Detail (Slide-in) */}
      {/* ================================================================ */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="relative w-full max-w-xl bg-[var(--bg-secondary)] shadow-[var(--shadow-lg)] overflow-y-auto animate-slide-in">
            {/* Loading State */}
            {drawerLoading && !drawerProspect && (
              <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                  <svg className="animate-spin h-8 w-8 mx-auto mb-3 text-[var(--vigi-gold)]" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <p className="text-sm text-[var(--text-secondary)]">Carregando dados...</p>
                </div>
              </div>
            )}
            {drawerProspect && (<>
            {/* Header */}
            <div className="sticky top-0 bg-[var(--bg-secondary)] border-b border-b-[var(--border-primary)] px-6 py-4 z-10">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-[var(--vigi-navy)] truncate">{drawerProspect.razao_social}</h2>
                  <p className="text-xs text-[var(--text-tertiary)]">{formatCNPJ(drawerProspect.cnpj)} · {drawerProspect.municipio}/{drawerProspect.uf}</p>
                </div>
                <button onClick={() => setDrawerOpen(false)} className="ml-4 p-1 rounded-[var(--radius-sm)] hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">✕</button>
              </div>

              {/* Status + Quick Actions */}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${STATUS_MAP[drawerProspect.status]?.bg} ${STATUS_MAP[drawerProspect.status]?.color} border ${STATUS_MAP[drawerProspect.status]?.border}`}>
                  {STATUS_MAP[drawerProspect.status]?.emoji} {STATUS_MAP[drawerProspect.status]?.label}
                </span>
                <TempDot temp={drawerProspect.temperatura} />
                <ScoreBadge score={drawerProspect.score} />
                {getRottingStatus(drawerProspect) === "danger" && (
                  <span className="text-[10px] text-[var(--status-danger)] font-semibold bg-[var(--status-danger-bg)] px-2 py-0.5 rounded-full">🔴 Esfriando</span>
                )}
                <div className="flex-1" />
                {NEXT_STATUS[drawerProspect.status] && (
                  <Button size="sm" onClick={() => handleAdvance(drawerProspect.id, NEXT_STATUS[drawerProspect.status]!)}>
                    → {STATUS_MAP[NEXT_STATUS[drawerProspect.status]!]?.label}
                  </Button>
                )}
              </div>

              {/* Quick Action Buttons */}
              <div className="flex gap-2 mt-3 flex-wrap">
                <QuickBtn label="📞 Ligação" onClick={() => { setActivityOpen(true); }} />
                <QuickBtn label="📅 Follow-up" onClick={() => setQuickFollowupOpen(true)} />
                <QuickBtn label="📝 Nota" onClick={() => setActivityOpen(true)} />
                {drawerProspect.cnpj && (
                  <QuickBtn
                    label={enriching ? "⏳ Enriquecendo..." : "🔄 Enriquecer"}
                    onClick={handleEnrich}
                    disabled={enriching}
                  />
                )}
                {drawerProspect.email && (
                  <QuickBtn label="📧 Email" onClick={() => window.open(`mailto:${drawerProspect.contato_email || drawerProspect.email}`)} />
                )}
                {drawerProspect.telefone1 && (
                  <QuickBtn label="💬 WhatsApp" onClick={() => {
                    const phone = (drawerProspect.contato_telefone || drawerProspect.telefone1 || "").replace(/\D/g, "");
                    window.open(`https://wa.me/55${phone}`);
                  }} />
                )}
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-4">
              <Tabs defaultValue="info">
                <TabsList>
                  <TabsTrigger value="info">Dados</TabsTrigger>
                  <TabsTrigger value="comercial">Comercial</TabsTrigger>
                  <TabsTrigger value="emails">Emails</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline ({drawerProspect.activities?.length || 0})</TabsTrigger>
                </TabsList>

                <TabsContent value="info">
                  <div className="space-y-5 mt-4">
                    <Section title="Empresa">
                      <Field label="Razão Social" value={drawerProspect.razao_social} />
                      <Field label="Fantasia" value={drawerProspect.nome_fantasia} />
                      <Field label="CNAE" value={drawerProspect.cnae_descricao} />
                      <Field label="Abertura" value={drawerProspect.data_abertura} />
                      <Field label="Capital" value={drawerProspect.capital_social ? `R$ ${drawerProspect.capital_social.toLocaleString("pt-BR")}` : null} />
                      <Field label="Porte" value={drawerProspect.porte} />
                    </Section>
                    <Section title="Contato">
                      <Field label="Email" value={drawerProspect.email} link={drawerProspect.email ? `mailto:${drawerProspect.email}` : undefined} />
                      <Field label="Tel. 1" value={drawerProspect.telefone1} />
                      <Field label="Tel. 2" value={drawerProspect.telefone2} />
                    </Section>
                    <Section title="Endereço">
                      <Field label="Logradouro" value={[drawerProspect.logradouro, drawerProspect.numero].filter(Boolean).join(", ")} />
                      <Field label="Bairro/CEP" value={[drawerProspect.bairro, drawerProspect.cep].filter(Boolean).join(" · ")} />
                    </Section>
                  </div>
                </TabsContent>

                <TabsContent value="comercial">
                  <div className="space-y-5 mt-4">
                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>Editar</Button>
                      {["negociacao", "qualificado", "proposta_enviada"].includes(drawerProspect.status) && (
                        <Button size="sm" onClick={() => setConvertOpen(true)}>Converter em Cliente</Button>
                      )}
                      {!["ganho", "perdido"].includes(drawerProspect.status) && (
                        <Button size="sm" variant="ghost" onClick={() => handleAdvance(drawerProspect.id, "perdido")}>Marcar Perdido</Button>
                      )}
                    </div>
                    <Section title="Contato Comercial">
                      <Field label="Nome" value={drawerProspect.contato_nome} />
                      <Field label="Cargo" value={drawerProspect.contato_cargo} />
                      <Field label="Email" value={drawerProspect.contato_email} />
                      <Field label="Telefone" value={drawerProspect.contato_telefone} />
                    </Section>
                    <Section title="Negociação">
                      <Field label="Plano" value={drawerProspect.plano_interesse} />
                      <Field label="MRR Estimado" value={drawerProspect.valor_estimado ? formatBrl(drawerProspect.valor_estimado) : null} />
                      <Field label="MRR Ponderado" value={formatBrl(getWeightedValue(drawerProspect))} />
                      <Field label="Último Contato" value={drawerProspect.ultimo_contato?.split("T")[0]} />
                      <Field label="Follow-up" value={drawerProspect.proximo_followup} />
                    </Section>
                    {drawerProspect.notas && <Section title="Notas"><p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap col-span-2">{drawerProspect.notas}</p></Section>}
                  </div>
                </TabsContent>

                <TabsContent value="emails">
                  <ProspectEmailsTab prospectEmail={drawerProspect.contato_email || drawerProspect.email || undefined} prospectId={drawerProspect.id} />
                </TabsContent>

                <TabsContent value="timeline">
                  <div className="mt-4">
                    <Button size="sm" onClick={() => setActivityOpen(true)} className="mb-4">+ Atividade</Button>
                    {!(drawerProspect.activities?.length) ? (
                      <p className="text-sm text-[var(--text-tertiary)] text-center py-12">Nenhuma atividade</p>
                    ) : (
                      <div className="relative pl-4">
                        <div className="absolute left-1.5 top-0 bottom-0 w-px bg-[var(--border-primary)]" />
                        <div className="space-y-3">
                          {(drawerProspect.activities || []).map((act) => (
                            <div key={act.id} className="relative pl-6">
                              <div className="absolute -left-0.5 top-2 w-3 h-3 rounded-full bg-[var(--bg-secondary)] border-2 border-[var(--vigi-gold)]" />
                              <div className="bg-[var(--bg-tertiary)] rounded-[var(--radius-md)] p-3 border border-[var(--border-primary)]">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[10px] font-semibold bg-[var(--bg-secondary)] border border-[var(--border-primary)] px-2 py-0.5 rounded-[var(--radius-sm)]">
                                    {ACTIVITY_TYPES.find(t => t.value === act.tipo)?.label || act.tipo}
                                  </span>
                                  <span className="text-[10px] text-[var(--text-tertiary)]">
                                    {new Date(act.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                </div>
                                <p className="text-sm text-[var(--text-primary)]">{act.descricao}</p>
                                {act.resultado && <p className="text-xs text-[var(--text-secondary)] mt-1 italic">→ {act.resultado}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </>)}
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* MODALS */}
      {/* ================================================================ */}

      <Modal open={convertOpen} onClose={() => setConvertOpen(false)} title="Converter em Cliente">
        <form onSubmit={handleConvert} className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">Ao converter, uma empresa será criada com status trial.</p>
          <Select id="plano" name="plano" label="Plano" required options={PLANOS} defaultValue="essencial" />
          <Input id="valor_mensal" name="valor_mensal" label="Valor (Custom)" type="number" step="0.01" />
          <div className="flex justify-end gap-3 pt-4 border-t border-t-[var(--border-primary)]">
            <Button variant="secondary" type="button" onClick={() => setConvertOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={saving}>Converter</Button>
          </div>
        </form>
      </Modal>

      <Modal open={activityOpen} onClose={() => setActivityOpen(false)} title="Registrar Atividade">
        <form onSubmit={handleAddActivity} className="space-y-4">
          <Select id="tipo" name="tipo" label="Tipo" required options={ACTIVITY_TYPES} defaultValue="ligacao" />
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Descrição</label>
            <textarea name="descricao" required rows={3}
              className="w-full rounded-[var(--radius-md)] border border-[var(--border-primary)] bg-[var(--bg-input)] text-[var(--text-primary)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--border-focus)]/12" />
          </div>
          <Input id="resultado" name="resultado" label="Resultado" placeholder="Ex: Pediu proposta..." />
          <div className="flex justify-end gap-3 pt-4 border-t border-t-[var(--border-primary)]">
            <Button variant="secondary" type="button" onClick={() => setActivityOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={saving}>Registrar</Button>
          </div>
        </form>
      </Modal>

      <Modal open={quickFollowupOpen} onClose={() => setQuickFollowupOpen(false)} title="Agendar Follow-up">
        <form onSubmit={handleQuickFollowup} className="space-y-4">
          <Input id="data" name="data" label="Data do Follow-up" type="date" required />
          <Input id="nota" name="nota" label="Nota (opcional)" placeholder="Lembrete sobre o que tratar..." />
          <div className="flex gap-2 flex-wrap">
            {[1, 3, 7, 14, 30].map(d => {
              const date = new Date(); date.setDate(date.getDate() + d);
              return (
                <button key={d} type="button" onClick={(e) => {
                  const input = (e.target as HTMLElement).closest("form")?.querySelector("input[name=data]") as HTMLInputElement;
                  if (input) input.value = date.toISOString().split("T")[0];
                }} className="text-xs px-2 py-1 rounded-[var(--radius-sm)] border border-[var(--border-primary)] hover:bg-[var(--bg-hover)] transition-colors">
                  +{d}d
                </button>
              );
            })}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-t-[var(--border-primary)]">
            <Button variant="secondary" type="button" onClick={() => setQuickFollowupOpen(false)}>Cancelar</Button>
            <Button type="submit" loading={saving}>Agendar</Button>
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar Lead" size="lg">
        {drawerProspect && (
          <form onSubmit={handleEditSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input id="contato_nome" name="contato_nome" label="Nome Contato" defaultValue={drawerProspect.contato_nome || ""} />
              <Input id="contato_cargo" name="contato_cargo" label="Cargo" defaultValue={drawerProspect.contato_cargo || ""} />
              <Input id="contato_email" name="contato_email" label="Email" type="email" defaultValue={drawerProspect.contato_email || ""} />
              <Input id="contato_telefone" name="contato_telefone" label="Telefone" defaultValue={drawerProspect.contato_telefone || ""} />
              <Select id="temperatura" name="temperatura" label="Temperatura"
                options={Object.entries(TEMP_CONFIG).map(([k, v]) => ({ value: k, label: v.label }))}
                defaultValue={drawerProspect.temperatura} />
              <Select id="plano_interesse" name="plano_interesse" label="Plano"
                options={[{ value: "", label: "—" }, ...PLANOS]} defaultValue={drawerProspect.plano_interesse || ""} />
              <Input id="valor_estimado" name="valor_estimado" label="MRR Estimado" type="number" step="0.01"
                defaultValue={drawerProspect.valor_estimado?.toString() || ""} />
              <Input id="proximo_followup" name="proximo_followup" label="Follow-up" type="date"
                defaultValue={drawerProspect.proximo_followup || ""} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">Notas</label>
              <textarea name="notas" rows={3}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border-primary)] bg-[var(--bg-input)] text-[var(--text-primary)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--border-focus)] focus:ring-2 focus:ring-[var(--border-focus)]/12"
                defaultValue={drawerProspect.notas || ""} />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-t-[var(--border-primary)]">
              <Button variant="secondary" type="button" onClick={() => setEditOpen(false)}>Cancelar</Button>
              <Button type="submit" loading={saving}>Salvar</Button>
            </div>
          </form>
        )}
      </Modal>

      <style jsx global>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .animate-slide-in { animation: slideIn 0.2s ease-out; }
      `}</style>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function Kpi({ label, value, sub, accent, color }: { label: string; value: string; sub?: string; accent?: boolean; color?: string }) {
  return (
    <div className="bg-[var(--bg-secondary)] rounded-[var(--radius-md)] border border-[var(--border-primary)] p-2.5 shadow-[var(--shadow-sm)]">
      <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold ${color || (accent ? "text-[var(--vigi-gold)]" : "text-[var(--vigi-navy)]")}`}>{value}</p>
      {sub && <p className="text-[9px] text-[var(--text-tertiary)]">{sub}</p>}
    </div>
  );
}

function ScoreBadge({ score, small }: { score: number; small?: boolean }) {
  const c = score >= 70 ? "text-[var(--status-success)] bg-[var(--status-success-bg)] border-[var(--status-success)]" : score >= 40 ? "text-[var(--status-warning)] bg-[var(--status-warning-bg)] border-[var(--status-warning)]" : "text-[var(--text-secondary)] bg-[var(--bg-tertiary)] border-[var(--border-primary)]";
  return <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[var(--radius-sm)] border font-bold ${c} ${small ? "text-[9px]" : "text-[10px]"}`}>★ {score}</span>;
}

function TempDot({ temp }: { temp: LeadTemperatura }) {
  const c = TEMP_CONFIG[temp];
  return <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${c.color}`}><span className={`w-2 h-2 rounded-full ${c.dot}`} />{c.label}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h3 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2 border-b border-b-[var(--border-primary)] pb-1">{title}</h3><div className="grid grid-cols-2 gap-x-4 gap-y-2">{children}</div></div>;
}

function Field({ label, value, link }: { label: string; value: string | number | null | undefined; link?: string }) {
  return <div><p className="text-[10px] text-[var(--text-tertiary)]">{label}</p>{link ? <a href={link} className="text-sm font-medium text-[var(--status-info)] hover:underline">{value || "—"}</a> : <p className="text-sm font-medium text-[var(--vigi-navy)]">{value || "—"}</p>}</div>;
}

function QuickBtn({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return <button onClick={onClick} disabled={disabled} className={`text-[10px] px-2 py-1 rounded-[var(--radius-md)] border border-[var(--border-primary)] bg-[var(--bg-tertiary)] transition-all font-medium ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-[var(--btn-primary)] hover:text-white hover:border-[var(--btn-primary)]"}`}>{label}</button>;
}

// ============================================================================
// ProspectEmailsTab — Shows all emails sent/received for a prospect
// ============================================================================
function ProspectEmailsTab({ prospectEmail, prospectId }: { prospectEmail?: string; prospectId: string }) {
  const [emails, setEmails] = useState<Array<{
    id: string;
    direction: "inbound" | "outbound";
    subject: string;
    status: string;
    date: string;
    from_email?: string;
    to_email?: string;
    template_id?: string;
    erro_detalhe?: string;
    opened_at?: string;
    clicked_at?: string;
    body_text?: string;
  }>>([]);
  const [stats, setStats] = useState({ total: 0, sent: 0, pending: 0, errors: 0, received: 0, opened: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!prospectEmail) { setLoading(false); return; }
    setLoading(true);
    fetch(`/api/emails/by-recipient?email=${encodeURIComponent(prospectEmail)}&limit=50`)
      .then((r) => r.json())
      .then((data) => {
        setEmails(data.emails || []);
        setStats(data.stats || stats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospectEmail]);

  if (!prospectEmail) {
    return <div className="mt-4 text-center text-sm text-[var(--text-tertiary)] py-12">Prospect sem email cadastrado</div>;
  }

  if (loading) {
    return <div className="mt-4 text-center text-sm text-[var(--text-tertiary)] py-12">Carregando emails...</div>;
  }

  const statusIcon = (status: string, direction: string) => {
    if (direction === "inbound") return "📨";
    switch (status) {
      case "enviado": return "✅";
      case "pendente": return "⏳";
      case "erro": return "❌";
      default: return "📧";
    }
  };

  const templateNames: Record<string, string> = {
    A: "Boas-vindas", B: "Confirmação", C: "Alerta Validade", D: "Renovação",
    E: "Caso Desconhecido", F: "Urgência", G: "Alerta Frota", H: "Alerta DOU",
    I: "Prospecção DOU", J: "Relatório Mensal", K: "Billing", L: "Reset Senha",
    M: "Sistema", N: "Convite", O: "Procuração",
  };

  return (
    <div className="mt-4 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-[var(--bg-tertiary)] rounded-[var(--radius-md)] p-3 text-center border border-[var(--border-primary)]">
          <p className="text-lg font-bold text-[var(--status-success)]">{stats.sent}</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">Enviados</p>
        </div>
        <div className="bg-[var(--bg-tertiary)] rounded-[var(--radius-md)] p-3 text-center border border-[var(--border-primary)]">
          <p className="text-lg font-bold text-[var(--status-info)]">{stats.received}</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">Recebidos</p>
        </div>
        <div className="bg-[var(--bg-tertiary)] rounded-[var(--radius-md)] p-3 text-center border border-[var(--border-primary)]">
          <p className="text-lg font-bold text-[var(--vigi-gold)]">{stats.opened}</p>
          <p className="text-[10px] text-[var(--text-tertiary)]">Abertos</p>
        </div>
      </div>

      {stats.errors > 0 && (
        <div className="bg-[var(--status-danger-bg)] border border-[var(--status-danger)] rounded-[var(--radius-md)] px-3 py-2 text-xs text-[var(--status-danger)]">
          ⚠️ {stats.errors} email(s) com erro de envio
        </div>
      )}

      {/* Email list */}
      {emails.length === 0 ? (
        <div className="text-center text-sm text-[var(--text-tertiary)] py-12">
          📭 Nenhum email enviado ou recebido
        </div>
      ) : (
        <div className="space-y-1">
          {emails.map((email) => (
            <button
              key={`${email.direction}-${email.id}`}
              onClick={() => setExpandedId(expandedId === email.id ? null : email.id)}
              className="w-full text-left rounded-[var(--radius-md)] border border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
            >
              <div className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{statusIcon(email.status, email.direction)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{email.subject || "(sem assunto)"}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {email.direction === "outbound" && email.template_id && (
                        <span className="text-[9px] bg-[var(--bg-tertiary)] border border-[var(--border-primary)] px-1.5 py-0.5 rounded-full text-[var(--text-tertiary)]">
                          {templateNames[email.template_id] || email.template_id}
                        </span>
                      )}
                      <span className="text-[10px] text-[var(--text-tertiary)]">
                        {email.direction === "inbound" ? "Recebido" : "Enviado"} — {new Date(email.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {email.opened_at && <span className="text-[9px] text-[var(--vigi-gold)]">👁 Aberto</span>}
                      {email.clicked_at && <span className="text-[9px] text-[var(--status-success)]">🔗 Clicado</span>}
                    </div>
                  </div>
                  <span className="text-[10px] text-[var(--text-tertiary)]">{expandedId === email.id ? "▲" : "▼"}</span>
                </div>

                {/* Expanded details */}
                {expandedId === email.id && (
                  <div className="mt-2 pt-2 border-t border-[var(--border-primary)] space-y-1">
                    {email.direction === "outbound" && (
                      <>
                        <p className="text-[10px] text-[var(--text-tertiary)]">Para: <span className="text-[var(--text-secondary)]">{email.to_email}</span></p>
                        <p className="text-[10px] text-[var(--text-tertiary)]">Status: <span className={email.status === "erro" ? "text-[var(--status-danger)]" : "text-[var(--status-success)]"}>{email.status}</span></p>
                        {email.erro_detalhe && <p className="text-[10px] text-[var(--status-danger)]">Erro: {email.erro_detalhe}</p>}
                      </>
                    )}
                    {email.direction === "inbound" && (
                      <>
                        <p className="text-[10px] text-[var(--text-tertiary)]">De: <span className="text-[var(--text-secondary)]">{email.from_email}</span></p>
                        {email.body_text && <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-4 whitespace-pre-wrap">{email.body_text}</p>}
                      </>
                    )}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricBox({ title, value, subtitle, color }: { title: string; value: string; subtitle: string; color: string }) {
  const accents: Record<string, string> = { green: "bg-[var(--status-success)]", amber: "bg-[var(--status-warning)]", red: "bg-[var(--status-danger)]", blue: "bg-[var(--vigi-navy)]", gold: "bg-[var(--vigi-gold)]" };
  const textColors: Record<string, string> = { green: "text-[var(--status-success)]", amber: "text-[var(--status-warning)]", red: "text-[var(--status-danger)]", blue: "text-[var(--vigi-navy)]", gold: "text-[var(--vigi-gold)]" };
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-5 overflow-hidden relative shadow-[var(--shadow-sm)]">
      <div className={`absolute top-0 left-0 w-full h-1 ${accents[color] || accents.blue}`} />
      <p className="text-xs text-[var(--text-secondary)] font-medium">{title}</p>
      <p className={`text-2xl font-bold mt-1 ${textColors[color] || textColors.blue}`}>{value}</p>
      <p className="text-[10px] text-[var(--text-tertiary)] mt-1">{subtitle}</p>
    </div>
  );
}
