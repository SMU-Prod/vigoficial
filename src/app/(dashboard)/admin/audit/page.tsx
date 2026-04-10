"use client";

import { useState, useMemo } from "react";
import { DataTable } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { useFetch } from "@/hooks/use-fetch";
import { formatDateTime } from "@/lib/formatters";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { FilterBar, FilterConfig } from "@/components/ui/filter-bar";
import { ExportButton } from "@/components/ui/export-button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Timeline, TimelineItem } from "@/components/ui/timeline";
import { Button } from "@/components/ui/button";

interface AuditLogRow {
  id: string;
  user_id: string;
  acao: string;
  detalhes: Record<string, unknown>;
  ip: string;
  company_id?: string;
  created_at: string;
}

interface UserRow {
  id: string;
  nome: string;
}

const AUDIT_TYPES = [
  { value: "login", label: "Login" },
  { value: "instrucao_usuario", label: "Instrução de Usuário" },
  { value: "violacao", label: "Violação" },
  { value: "sistema", label: "Sistema" },
  { value: "acao_gesp", label: "Ação GESP" },
];

export default function AuditPage() {
  const [filterValues, setFilterValues] = useState({
    search: "",
    tipo: "todos",
    user: "todos",
    dateFrom: "",
    dateTo: "",
  });
  const [viewMode, setViewMode] = useState<"table" | "timeline">("table");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const { data: auditLogs = [], loading: auditLoading } =
    useFetch<AuditLogRow[]>(
      `/api/admin/audit?page=${page}&limit=${pageSize}`
    );

  const { data: users = [] } = useFetch<UserRow[]>("/api/auth/users");

  // Create a map of user IDs to names
  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    (users ?? []).forEach((u) => map.set(u.id, u.nome));
    return map;
  }, [users]);

  // Filter logs by search, tipo, user, and date range
  const filteredLogs = useMemo(() => {
    let result = auditLogs ?? [];

    if (filterValues.search.trim()) {
      const searchLower = filterValues.search.toLowerCase();
      result = result.filter(
        (log) =>
          log.acao.toLowerCase().includes(searchLower) ||
          log.ip.toLowerCase().includes(searchLower) ||
          userMap.get(log.user_id)?.toLowerCase().includes(searchLower)
      );
    }

    if (filterValues.tipo !== "todos") {
      result = result.filter((log) => log.acao.startsWith(filterValues.tipo));
    }

    if (filterValues.user !== "todos") {
      result = result.filter((log) => log.user_id === filterValues.user);
    }

    if (filterValues.dateFrom) {
      const fromDate = new Date(filterValues.dateFrom);
      result = result.filter(
        (log) => new Date(log.created_at) >= fromDate
      );
    }

    if (filterValues.dateTo) {
      const toDate = new Date(filterValues.dateTo);
      toDate.setHours(23, 59, 59, 999);
      result = result.filter(
        (log) => new Date(log.created_at) <= toDate
      );
    }

    return result;
  }, [auditLogs, filterValues, userMap]);

  // Calculate stats
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const total = auditLogs?.length || 0;
    const hoje = auditLogs?.filter(log => {
      const logDate = new Date(log.created_at);
      logDate.setHours(0, 0, 0, 0);
      return logDate.getTime() === today.getTime();
    }).length || 0;

    const usuariosAtivos = new Set(auditLogs?.map(log => log.user_id) || []).size;
    const ultimoEvento = (auditLogs?.length ?? 0) > 0
      ? formatDateTime(auditLogs![0].created_at)
      : "-";

    return { total, hoje, usuariosAtivos, ultimoEvento };
  }, [auditLogs]);

  const getAcaoVariant = (acao: string): "default" | "success" | "warning" | "danger" | "info" => {
    if (acao.startsWith("violacao")) return "danger";
    if (acao.startsWith("sistema")) return "info";
    if (acao.startsWith("login")) return "success";
    if (acao.startsWith("acao_gesp")) return "warning";
    return "default";
  };

  const getAcaoColor = (acao: string) => {
    if (acao.startsWith("violacao")) return "text-[var(--status-danger)]";
    if (acao.startsWith("sistema")) return "text-[var(--status-info)]";
    if (acao.startsWith("login")) return "text-[var(--text-secondary)]";
    if (acao.startsWith("acao_gesp")) return "text-[var(--vigi-gold)]";
    return "text-[var(--text-secondary)]";
  };

  const getAcaoBgColor = (acao: string) => {
    if (acao.startsWith("violacao")) return "bg-[var(--status-danger-bg)]";
    if (acao.startsWith("sistema")) return "bg-[var(--status-info-bg)]";
    if (acao.startsWith("login")) return "bg-[var(--bg-tertiary)]";
    if (acao.startsWith("acao_gesp")) return "bg-[var(--status-warning-bg)]";
    return "bg-[var(--bg-tertiary)]";
  };

  // Convert logs to timeline items
  const timelineItems: TimelineItem[] = filteredLogs.map((log) => ({
    id: log.id,
    title: log.acao,
    description: `${userMap.get(log.user_id) || "Usuário Desconhecido"} - ${log.ip}`,
    timestamp: formatDateTime(log.created_at),
    variant: getAcaoVariant(log.acao),
  }));

  const filterConfigs: FilterConfig[] = [
    {
      key: "search",
      label: "Buscar",
      type: "search",
      placeholder: "Ação, IP ou usuário...",
    },
    {
      key: "tipo",
      label: "Tipo",
      type: "select",
      options: [
        { value: "todos", label: "Todos" },
        ...AUDIT_TYPES,
      ],
    },
    {
      key: "user",
      label: "Usuário",
      type: "select",
      options: [
        { value: "todos", label: "Todos" },
        ...(users?.map(u => ({ value: u.id, label: u.nome })) || []),
      ],
    },
  ];

  const exportColumns = [
    { key: "created_at", label: "Data/Hora" },
    { key: "user_id", label: "Usuário" },
    { key: "acao", label: "Ação" },
    { key: "ip", label: "IP" },
    { key: "detalhes", label: "Detalhes" },
  ];

  const exportData = filteredLogs.map(log => ({
    ...log,
    user_id: userMap.get(log.user_id) || "Desconhecido",
    detalhes: JSON.stringify(log.detalhes),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        subtitle="Registro imutável de atividades"
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total de Eventos"
          value={stats.total}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          }
          variant="default"
          loading={auditLoading}
        />
        <StatCard
          label="Eventos Hoje"
          value={stats.hoje}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          variant="success"
          loading={auditLoading}
        />
        <StatCard
          label="Usuários Ativos"
          value={stats.usuariosAtivos}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.856-1.487M15 10a3 3 0 11-6 0 3 3 0 016 0zM6 20a9 9 0 0118 0v2h2v-2a11 11 0 10-20 0v2h2v-2z" />
            </svg>
          }
          variant="info"
          loading={auditLoading}
        />
        <StatCard
          label="Último Evento"
          value={stats.ultimoEvento}
          icon={
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
          variant="warning"
          loading={auditLoading}
        />
      </div>

      {/* Filter Bar */}
      <FilterBar
        filters={filterConfigs}
        values={filterValues}
        onChange={(key, value) => setFilterValues(prev => ({ ...prev, [key]: value }))}
        onClear={() => setFilterValues({ search: "", tipo: "todos", user: "todos", dateFrom: "", dateTo: "" })}
      />

      {/* View Mode Tabs */}
      <Tabs defaultValue={viewMode} onValueChange={(v) => setViewMode(v as "table" | "timeline")}>
        <TabsList className="mb-4">
          <TabsTrigger value="table">Tabela</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        {/* Table View */}
        <TabsContent value="table">
          {!auditLoading && filteredLogs.length === 0 ? (
            <div className="vigi-card">
              <EmptyState
                icon="📋"
                title="Nenhum evento registrado"
                description="Não há registros de auditoria para os filtros selecionados"
              />
            </div>
          ) : (
            <div className="vigi-card p-6 overflow-x-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  {filteredLogs.length} evento{filteredLogs.length !== 1 ? "s" : ""}
                </h2>
                <ExportButton
                  data={exportData}
                  filename="audit-log"
                  columns={exportColumns}
                  formats={["csv", "excel"]}
                />
              </div>
              <DataTable
                columns={[
                  {
                    key: "created_at",
                    header: "Data/Hora",
                    render: (log: AuditLogRow) => (
                      <span className="text-sm whitespace-nowrap">
                        {formatDateTime(log.created_at)}
                      </span>
                    ),
                  },
                  {
                    key: "user_id",
                    header: "Executor",
                    render: (log: AuditLogRow) => (
                      <span className="text-sm">
                        {userMap.get(log.user_id) || "Usuário Desconhecido"}
                      </span>
                    ),
                  },
                  {
                    key: "acao",
                    header: "Tipo",
                    render: (log: AuditLogRow) => (
                      <span
                        className={`text-xs font-mono px-2 py-1 rounded-[var(--radius-sm)] ${getAcaoBgColor(log.acao)} ${getAcaoColor(log.acao)}`}
                      >
                        {log.acao}
                      </span>
                    ),
                  },
                  {
                    key: "detalhes",
                    header: "Descrição",
                    render: (log: AuditLogRow) => (
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {JSON.stringify(log.detalhes).slice(0, 80)}
                        {JSON.stringify(log.detalhes).length > 80 ? "..." : ""}
                      </span>
                    ),
                  },
                  {
                    key: "ip",
                    header: "IP",
                    render: (log: AuditLogRow) => (
                      <span className="text-xs font-mono text-[var(--text-secondary)]">
                        {log.ip}
                      </span>
                    ),
                  },
                ]}
                data={filteredLogs}
                loading={auditLoading}
                emptyMessage="Nenhum evento registrado."
              />
            </div>
          )}

          {/* Pagination info */}
          {filteredLogs.length > 0 && (
            <div className="flex justify-between items-center text-sm text-[var(--text-secondary)] mt-4">
              <span>Mostrando até {filteredLogs.length} registros por página</span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  aria-label="Página anterior"
                >
                  Anterior
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={filteredLogs.length < pageSize}
                  aria-label="Próxima página"
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Timeline View */}
        <TabsContent value="timeline">
          {!auditLoading && filteredLogs.length === 0 ? (
            <div className="vigi-card">
              <EmptyState
                icon="📋"
                title="Nenhum evento registrado"
                description="Não há registros de auditoria para os filtros selecionados"
              />
            </div>
          ) : (
            <Timeline
              items={timelineItems}
              maxItems={20}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
